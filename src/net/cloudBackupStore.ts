import type { EncryptedBackupEnvelope } from '../core/encryption';

export interface CloudBackupStore {
  put(objectId: string, envelope: EncryptedBackupEnvelope): Promise<void>;
  get(objectId: string): Promise<unknown>;
}

/**
 * Minimal backend-neutral object-store client. Authentication, accounts, and
 * provider-specific headers belong in a future store implementation; the
 * object written here is already encrypted on the phone.
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
