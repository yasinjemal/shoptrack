export const AUTOMATIC_CLOUD_BACKUP_PENDING_KEY = 'shoptrack_auto_cloud_backup_pending_v1';

export interface CloudBackupOutboxStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type AutomaticCloudBackupPlan = 'disabled' | 'request' | 'retry';

/** Pure startup policy: all three gates are mandatory, then only new daily data queues a revision. */
export function planAutomaticCloudBackup({
  optedIn,
  entitled,
  storeConfigured,
  newSnapshot,
}: {
  optedIn: boolean;
  entitled: boolean;
  storeConfigured: boolean;
  newSnapshot: boolean;
}): AutomaticCloudBackupPlan {
  if (!optedIn || !entitled || !storeConfigured) return 'disabled';
  return newSnapshot ? 'request' : 'retry';
}

export interface AutomaticCloudBackupDependencies {
  storage: CloudBackupOutboxStorage;
  clock: () => number;
  isOptedIn: () => boolean | Promise<boolean>;
  isStoreConfigured: () => boolean;
  loadRecoveryPhrase: () => Promise<string | null>;
  isRecoveryPhraseValid: (phrase: string) => boolean;
  upload: (phrase: string) => Promise<void>;
}

export type AutomaticCloudBackupStatus =
  | 'disabled'
  | 'unconfigured'
  | 'missing-recovery-phrase'
  | 'idle'
  | 'uploaded'
  | 'failed';

export interface AutomaticCloudBackupResult {
  status: AutomaticCloudBackupStatus;
  pending: boolean;
  error?: unknown;
}

interface PendingPush {
  version: 1;
  requested_at: number;
  revision: number;
}

function parsePendingPush(raw: string | null): PendingPush | null {
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingPush>;
    if (
      value.version !== 1
      || !Number.isFinite(value.requested_at)
      || !Number.isInteger(value.revision)
      || (value.revision ?? 0) < 1
    ) return null;
    return value as PendingPush;
  } catch {
    return null;
  }
}

/**
 * A persistent, payload-free outbox for automatic encrypted backups.
 *
 * The marker says only that the newest database state still needs uploading.
 * The upload dependency builds and encrypts that state at attempt time. Calls
 * made while an upload is in flight overwrite the marker, so at most one
 * follow-up upload is needed no matter how many newer requests arrive.
 */
export class AutomaticCloudBackupCoordinator {
  private mutationTail: Promise<void> = Promise.resolve();
  private inFlight: Promise<AutomaticCloudBackupResult> | null = null;

  constructor(private readonly dependencies: AutomaticCloudBackupDependencies) {}

  /** Queue the current state, then make a best-effort attempt to drain it. */
  async requestPush(): Promise<AutomaticCloudBackupResult> {
    const eligibility = await this.checkEligibility();
    if (typeof eligibility !== 'string') return eligibility;

    try {
      await this.withMutation(async () => {
        const raw = await this.dependencies.storage.getItem(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY);
        const current = parsePendingPush(raw);
        const now = this.dependencies.clock();
        const requestedAt = Number.isFinite(now) ? Math.trunc(now) : 0;
        const pending: PendingPush = {
          version: 1,
          requested_at: Math.max(current?.requested_at ?? 0, requestedAt),
          revision: (current?.revision ?? 0) + 1,
        };
        await this.dependencies.storage.setItem(
          AUTOMATIC_CLOUD_BACKUP_PENDING_KEY,
          JSON.stringify(pending)
        );
      });
    } catch (error) {
      return { status: 'failed', pending: false, error };
    }

    return this.drainAll(eligibility);
  }

  /** Retry a marker left by an earlier offline or failed attempt. */
  async retryPending(): Promise<AutomaticCloudBackupResult> {
    const eligibility = await this.checkEligibility();
    if (typeof eligibility !== 'string') return eligibility;

    try {
      const pending = await this.readPending();
      if (!pending) return { status: 'idle', pending: false };
    } catch (error) {
      return { status: 'failed', pending: false, error };
    }
    return this.drainAll(eligibility);
  }

  private async checkEligibility(): Promise<string | AutomaticCloudBackupResult> {
    try {
      // Ordering is deliberate: disabled builds do not touch storage, secure
      // storage, encryption, or networking during startup.
      if (!(await this.dependencies.isOptedIn())) {
        return { status: 'disabled', pending: false };
      }
      if (!this.dependencies.isStoreConfigured()) {
        return { status: 'unconfigured', pending: false };
      }
      const phrase = await this.dependencies.loadRecoveryPhrase();
      if (!phrase || !this.dependencies.isRecoveryPhraseValid(phrase)) {
        return { status: 'missing-recovery-phrase', pending: false };
      }
      return phrase;
    } catch (error) {
      return { status: 'failed', pending: false, error };
    }
  }

  private async drainAll(phrase: string): Promise<AutomaticCloudBackupResult> {
    let uploaded = false;
    while (true) {
      const result = await this.kick(phrase);
      if (result.status === 'failed') return result;
      uploaded ||= result.status === 'uploaded';

      try {
        if (!(await this.readPending())) {
          return { status: uploaded ? 'uploaded' : 'idle', pending: false };
        }
      } catch (error) {
        return { status: 'failed', pending: true, error };
      }
    }
  }

  private kick(phrase: string): Promise<AutomaticCloudBackupResult> {
    if (!this.inFlight) {
      const attempt = this.drainOnce(phrase);
      this.inFlight = attempt;
      void attempt.then(() => {
        if (this.inFlight === attempt) this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async drainOnce(phrase: string): Promise<AutomaticCloudBackupResult> {
    let raw: string | null;
    let pending: PendingPush | null;
    try {
      raw = await this.withMutation(() =>
        this.dependencies.storage.getItem(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY)
      );
      pending = parsePendingPush(raw);
      if (!pending) {
        if (raw != null) {
          await this.withMutation(() =>
            this.dependencies.storage.removeItem(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY)
          );
        }
        return { status: 'idle', pending: false };
      }
    } catch (error) {
      return { status: 'failed', pending: false, error };
    }

    try {
      await this.dependencies.upload(phrase);
    } catch (error) {
      return { status: 'failed', pending: true, error };
    }

    try {
      let newerPending = false;
      await this.withMutation(async () => {
        const latestRaw = await this.dependencies.storage.getItem(
          AUTOMATIC_CLOUD_BACKUP_PENDING_KEY
        );
        if (latestRaw === raw) {
          await this.dependencies.storage.removeItem(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY);
        } else {
          newerPending = parsePendingPush(latestRaw) != null;
        }
      });
      return { status: 'uploaded', pending: newerPending };
    } catch (error) {
      // An upload happened, but without an atomic compare-and-remove we cannot
      // claim the outbox is empty. Retrying is safer than dropping the marker.
      return { status: 'failed', pending: true, error };
    }
  }

  private async readPending(): Promise<PendingPush | null> {
    return this.withMutation(async () => {
      const raw = await this.dependencies.storage.getItem(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY);
      const pending = parsePendingPush(raw);
      if (raw != null && !pending) {
        await this.dependencies.storage.removeItem(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY);
      }
      return pending;
    });
  }

  private async withMutation<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}
