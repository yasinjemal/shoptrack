import assert from 'node:assert/strict';

import {
  AUTOMATIC_CLOUD_BACKUP_PENDING_KEY,
  AutomaticCloudBackupCoordinator,
  planAutomaticCloudBackup,
  type AutomaticCloudBackupDependencies,
  type CloudBackupOutboxStorage,
} from './cloudBackupOutbox';

const VALID_PHRASE = 'valid remembered recovery phrase';

class MemoryStorage implements CloudBackupOutboxStorage {
  readonly values = new Map<string, string>();
  reads = 0;
  writes = 0;

  async getItem(key: string): Promise<string | null> {
    this.reads += 1;
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.writes += 1;
    this.values.delete(key);
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function dependencies(overrides: Partial<AutomaticCloudBackupDependencies> = {}) {
  const storage = overrides.storage ?? new MemoryStorage();
  const uploads: string[] = [];
  let now = 100;
  const value: AutomaticCloudBackupDependencies & {
    storage: CloudBackupOutboxStorage;
    uploads: string[];
    setNow(next: number): void;
  } = {
    storage,
    clock: () => now,
    isOptedIn: () => true,
    isStoreConfigured: () => true,
    loadRecoveryPhrase: async () => VALID_PHRASE,
    isRecoveryPhraseValid: phrase => phrase === VALID_PHRASE,
    upload: async phrase => { uploads.push(phrase); },
    ...overrides,
    uploads,
    setNow(next: number) { now = next; },
  };
  return value;
}

async function run(): Promise<void> {
  console.log('TEST: startup queues only a new daily snapshot and otherwise retries');
  assert.equal(planAutomaticCloudBackup({
    optedIn: true, entitled: true, storeConfigured: true, newSnapshot: true,
  }), 'request');
  assert.equal(planAutomaticCloudBackup({
    optedIn: true, entitled: true, storeConfigured: true, newSnapshot: false,
  }), 'retry');
  for (const blocked of [
    { optedIn: false, entitled: true, storeConfigured: true, newSnapshot: true },
    { optedIn: true, entitled: false, storeConfigured: true, newSnapshot: true },
    { optedIn: true, entitled: true, storeConfigured: false, newSnapshot: true },
  ]) assert.equal(planAutomaticCloudBackup(blocked), 'disabled');

  console.log('TEST: automatic cloud backup is inert without explicit opt-in');
  const disabledStorage = new MemoryStorage();
  let disabledPhraseReads = 0;
  let disabledUploads = 0;
  const disabled = new AutomaticCloudBackupCoordinator(dependencies({
    storage: disabledStorage,
    isOptedIn: () => false,
    loadRecoveryPhrase: async () => { disabledPhraseReads += 1; return VALID_PHRASE; },
    upload: async () => { disabledUploads += 1; },
  }));
  assert.deepEqual(await disabled.requestPush(), { status: 'disabled', pending: false });
  assert.equal(disabledStorage.reads, 0);
  assert.equal(disabledStorage.writes, 0);
  assert.equal(disabledPhraseReads, 0);
  assert.equal(disabledUploads, 0);

  console.log('TEST: automatic cloud backup requires a configured store and valid remembered phrase');
  const unconfiguredStorage = new MemoryStorage();
  let unconfiguredPhraseReads = 0;
  const unconfigured = new AutomaticCloudBackupCoordinator(dependencies({
    storage: unconfiguredStorage,
    isStoreConfigured: () => false,
    loadRecoveryPhrase: async () => { unconfiguredPhraseReads += 1; return VALID_PHRASE; },
  }));
  assert.equal((await unconfigured.requestPush()).status, 'unconfigured');
  assert.equal(unconfiguredStorage.reads, 0);
  assert.equal(unconfiguredStorage.writes, 0);
  assert.equal(unconfiguredPhraseReads, 0);

  const invalidStorage = new MemoryStorage();
  let invalidUploads = 0;
  const invalidPhrase = new AutomaticCloudBackupCoordinator(dependencies({
    storage: invalidStorage,
    loadRecoveryPhrase: async () => 'not valid',
    upload: async () => { invalidUploads += 1; },
  }));
  assert.equal((await invalidPhrase.requestPush()).status, 'missing-recovery-phrase');
  assert.equal(invalidStorage.writes, 0);
  assert.equal(invalidUploads, 0);

  console.log('TEST: failed pushes stay pending and retry after restart');
  const retryStorage = new MemoryStorage();
  const offline = new Error('offline');
  const failedCoordinator = new AutomaticCloudBackupCoordinator(dependencies({
    storage: retryStorage,
    upload: async () => { throw offline; },
  }));
  const failed = await failedCoordinator.requestPush();
  assert.equal(failed.status, 'failed');
  assert.equal(failed.pending, true);
  assert.equal(failed.error, offline);
  assert.ok(retryStorage.values.has(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY));

  let retried = 0;
  const restartedCoordinator = new AutomaticCloudBackupCoordinator(dependencies({
    storage: retryStorage,
    upload: async phrase => {
      assert.equal(phrase, VALID_PHRASE);
      retried += 1;
    },
  }));
  assert.deepEqual(await restartedCoordinator.retryPending(), { status: 'uploaded', pending: false });
  assert.equal(retried, 1);
  assert.equal(retryStorage.values.has(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY), false);
  assert.deepEqual(await restartedCoordinator.retryPending(), { status: 'idle', pending: false });

  console.log('TEST: requests during a push coalesce to one newest follow-up');
  const coalesceStorage = new MemoryStorage();
  const firstUpload = deferred();
  let uploadCount = 0;
  const coalesceDependencies = dependencies({
    storage: coalesceStorage,
    upload: async () => {
      uploadCount += 1;
      if (uploadCount === 1) await firstUpload.promise;
    },
  });
  const coordinator = new AutomaticCloudBackupCoordinator(coalesceDependencies);
  coalesceDependencies.setNow(100);
  const first = coordinator.requestPush();
  while (uploadCount === 0) await Promise.resolve();

  coalesceDependencies.setNow(200);
  const second = coordinator.requestPush();
  coalesceDependencies.setNow(300);
  const third = coordinator.requestPush();
  while (JSON.parse(coalesceStorage.values.get(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY)!).revision < 3) {
    await Promise.resolve();
  }
  const queued = JSON.parse(coalesceStorage.values.get(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY)!);
  assert.equal(queued.requested_at, 300);
  assert.equal(queued.revision, 3);

  firstUpload.resolve();
  const results = await Promise.all([first, second, third]);
  assert.equal(uploadCount, 2, 'one in-flight upload plus one coalesced newest upload');
  assert.ok(results.every(result => result.status === 'uploaded' && !result.pending));
  assert.equal(coalesceStorage.values.has(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY), false);

  console.log('TEST: opting out leaves an existing retry marker untouched');
  retryStorage.values.set(
    AUTOMATIC_CLOUD_BACKUP_PENDING_KEY,
    JSON.stringify({ version: 1, requested_at: 500, revision: 1 })
  );
  const optedOut = new AutomaticCloudBackupCoordinator(dependencies({
    storage: retryStorage,
    isOptedIn: () => false,
  }));
  assert.equal((await optedOut.retryPending()).status, 'disabled');
  assert.ok(retryStorage.values.has(AUTOMATIC_CLOUD_BACKUP_PENDING_KEY));
}

void run().then(() => console.log('automatic cloud backup outbox tests passed'));
