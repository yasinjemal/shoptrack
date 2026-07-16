import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { base64, base64urlnopad } from '@scure/base';

export const ENCRYPTED_BACKUP_FORMAT = 1 as const;
export const SCRYPT_N = 2 ** 15;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const NONCE_BYTES = 24;

export interface EncryptedBackupEnvelope {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  cipher: 'xchacha20-poly1305';
  kdf: {
    name: 'scrypt';
    salt: string;
    N: typeof SCRYPT_N;
    r: typeof SCRYPT_R;
    p: typeof SCRYPT_P;
  };
  nonce: string;
  ciphertext: string;
  backup_format_version: number;
  created_at: string;
}

export type RandomBytes = (length: number) => Uint8Array | Promise<Uint8Array>;

/** Canonicalise the human-entered phrase before deriving either key or object ID. */
export function normaliseRecoveryPhrase(phrase: string): string {
  const normalised = phrase.trim().toLowerCase().split(/\s+/).join(' ');
  if (!normalised) throw new Error('Recovery phrase is required.');
  return normalised;
}

/**
 * Derive a server-safe, non-identifying object key from a random recovery phrase.
 * The server never needs the phrase and a restore needs no separate account ID.
 */
export function cloudObjectIdForPhrase(phrase: string): string {
  const digest = sha256(utf8ToBytes(`shoptrack-object-v1:${normaliseRecoveryPhrase(phrase)}`));
  return base64urlnopad.encode(digest);
}

function additionalData(backupFormatVersion: number): Uint8Array {
  return utf8ToBytes(`shoptrack-encrypted-backup-v1:${backupFormatVersion}`);
}

async function deriveKey(phrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return scryptAsync(normaliseRecoveryPhrase(phrase), salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: KEY_BYTES,
    asyncTick: 8,
    maxmem: SCRYPT_MAX_MEMORY,
  });
}

function assertEnvelope(value: unknown): asserts value is EncryptedBackupEnvelope {
  if (!value || typeof value !== 'object') throw new Error('Encrypted backup is not an object.');
  const envelope = value as Partial<EncryptedBackupEnvelope>;
  if (
    envelope.format !== ENCRYPTED_BACKUP_FORMAT ||
    envelope.cipher !== 'xchacha20-poly1305' ||
    envelope.kdf?.name !== 'scrypt' ||
    envelope.kdf.N !== SCRYPT_N ||
    envelope.kdf.r !== SCRYPT_R ||
    envelope.kdf.p !== SCRYPT_P ||
    typeof envelope.kdf.salt !== 'string' ||
    typeof envelope.nonce !== 'string' ||
    typeof envelope.ciphertext !== 'string' ||
    !Number.isInteger(envelope.backup_format_version) ||
    (envelope.backup_format_version ?? 0) < 1 ||
    typeof envelope.created_at !== 'string'
  ) {
    throw new Error('Encrypted backup format is not supported.');
  }
}

/** Encrypt a serialized ShopTrack backup; all random bytes must come from a CSPRNG. */
export async function encryptBackupJson(
  plaintext: string,
  phrase: string,
  backupFormatVersion: number,
  randomBytes: RandomBytes,
  createdAt = new Date().toISOString()
): Promise<EncryptedBackupEnvelope> {
  if (!Number.isInteger(backupFormatVersion) || backupFormatVersion < 1) {
    throw new Error('Backup format version must be a positive integer.');
  }
  const salt = await randomBytes(SALT_BYTES);
  const nonce = await randomBytes(NONCE_BYTES);
  if (salt.length !== SALT_BYTES || nonce.length !== NONCE_BYTES) {
    throw new Error('The secure random source returned the wrong number of bytes.');
  }

  const key = await deriveKey(phrase, salt);
  try {
    const cipher = xchacha20poly1305(key, nonce, additionalData(backupFormatVersion));
    const ciphertext = cipher.encrypt(utf8ToBytes(plaintext));
    return {
      format: ENCRYPTED_BACKUP_FORMAT,
      cipher: 'xchacha20-poly1305',
      kdf: {
        name: 'scrypt',
        salt: base64.encode(salt),
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
      },
      nonce: base64.encode(nonce),
      ciphertext: base64.encode(ciphertext),
      backup_format_version: backupFormatVersion,
      created_at: createdAt,
    };
  } finally {
    key.fill(0);
  }
}

/** Authenticate and decrypt an untrusted envelope. A wrong phrase fails closed. */
export async function decryptBackupJson(
  value: unknown,
  phrase: string
): Promise<string> {
  assertEnvelope(value);
  const salt = base64.decode(value.kdf.salt);
  const nonce = base64.decode(value.nonce);
  const ciphertext = base64.decode(value.ciphertext);
  if (salt.length !== SALT_BYTES || nonce.length !== NONCE_BYTES || ciphertext.length < 16) {
    throw new Error('Encrypted backup data is damaged.');
  }

  const key = await deriveKey(phrase, salt);
  try {
    const cipher = xchacha20poly1305(
      key,
      nonce,
      additionalData(value.backup_format_version)
    );
    return bytesToUtf8(cipher.decrypt(ciphertext));
  } catch {
    throw new Error('The recovery phrase is wrong or the encrypted backup is damaged.');
  } finally {
    key.fill(0);
  }
}
