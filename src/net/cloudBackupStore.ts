import type { EncryptedBackupEnvelope } from '../core/encryption';

export interface CloudBackupStore {
  put(objectId: string, envelope: EncryptedBackupEnvelope): Promise<void>;
  get(objectId: string): Promise<unknown>;
}

/**
 * Minimal backend-neutral object-store client. Authentication, accounts, and
 * provider-specific headers belong in a provider store implementation such as
 * SupabaseCloudBackupStore below; the object written here is already
 * encrypted on the phone.
 */
export class HttpCloudBackupStore implements CloudBackupStore {
  constructor(
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch
  ) {}

  private url(objectId: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(objectId)}`;
  }

  async put(objectId: string, envelope: EncryptedBackupEnvelope): Promise<void> {
    const response = await this.request(this.url(objectId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) throw new Error(`Cloud backup upload failed (${response.status}).`);
  }

  async get(objectId: string): Promise<unknown> {
    const response = await this.request(this.url(objectId), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Cloud backup download failed (${response.status}).`);
    return response.json();
  }
}

export const SUPABASE_BACKUP_BUCKET = 'shop-backups';

/**
 * Supabase Storage adapter (C0 decision, 2026-07-18 — see
 * docs/SUPABASE-SETUP.md). Talks to the storage REST API directly so the app
 * gains no SDK; the anon key is a routing credential, never a secret — every
 * envelope is encrypted before it leaves the phone, and the object id is
 * derived from the recovery phrase. POST with x-upsert matches the outbox
 * contract: one latest blob per shop, created or replaced in a single call.
 */
export class SupabaseCloudBackupStore implements CloudBackupStore {
  constructor(
    private readonly projectUrl: string,
    private readonly anonKey: string,
    private readonly bucket: string = SUPABASE_BACKUP_BUCKET,
    private readonly request: typeof fetch = fetch
  ) {}

  private url(objectId: string): string {
    const base = this.projectUrl.replace(/\/+$/, '');
    return `${base}/storage/v1/object/${this.bucket}/${encodeURIComponent(objectId)}`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.anonKey}`, apikey: this.anonKey };
  }

  async put(objectId: string, envelope: EncryptedBackupEnvelope): Promise<void> {
    const response = await this.request(this.url(objectId), {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
        'x-upsert': 'true',
      },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) throw new Error(`Cloud backup upload failed (${response.status}).`);
  }

  async get(objectId: string): Promise<unknown> {
    const response = await this.request(this.url(objectId), {
      method: 'GET',
      headers: { ...this.authHeaders(), Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Cloud backup download failed (${response.status}).`);
    return response.json();
  }
}

export interface CloudBackupStoreConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  genericUrl?: string;
}

/**
 * One configuration path for every construction site. Supabase wins when both
 * of its variables are set; the generic HTTP store stays available for tests
 * and any future provider move; no configuration keeps cloud backup off —
 * the same fail-closed absence the UI already handles.
 *
 * The defaults must stay static `process.env.EXPO_PUBLIC_*` member
 * expressions: Expo inlines those at build time, so dynamic lookups would
 * read nothing on the phone.
 */
export function createConfiguredCloudBackupStore(
  config: CloudBackupStoreConfig = {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    genericUrl: process.env.EXPO_PUBLIC_CLOUD_BACKUP_URL,
  },
  request: typeof fetch = fetch
): CloudBackupStore | null {
  if (config.supabaseUrl && config.supabaseAnonKey) {
    return new SupabaseCloudBackupStore(
      config.supabaseUrl,
      config.supabaseAnonKey,
      SUPABASE_BACKUP_BUCKET,
      request
    );
  }
  if (config.genericUrl) return new HttpCloudBackupStore(config.genericUrl, request);
  return null;
}
