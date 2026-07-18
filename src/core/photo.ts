export const MANAGED_PHOTO_DIRECTORY = 'shoptrack-media';
export const PHOTO_MAX_LONG_EDGE = 800;
export const PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const PENDING_PHOTO_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

export type PhotoPurpose = 'product' | 'customer' | 'receipt';

export interface PhotoResizePlan {
  /** Expected final width after applying `resize`; unchanged for small images. */
  width: number;
  /** Expected final height after applying `resize`; unchanged for small images. */
  height: number;
  /** Contextual ImageManipulator resize action, or null when no resize is needed. */
  resize: { width: number } | { height: number } | null;
}

export interface ManagedPhotoPath {
  purpose: PhotoPurpose;
  uniqueId: string;
  path: string;
}

export interface PendingPhotoRequest {
  version: 1;
  purpose: PhotoPurpose;
  requestId: string;
  requestedAt: number;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MANAGED_PHOTO_PATH = new RegExp(
  `^${MANAGED_PHOTO_DIRECTORY}/(product|customer|receipt)-(${UUID_V4.source.slice(1, -1)})\\.jpg$`
);

export function isPhotoPurpose(value: unknown): value is PhotoPurpose {
  return value === 'product' || value === 'customer' || value === 'receipt';
}

/** Cheap envelope/size check before any restored bytes reach an image view. */
export function isManagedJpegBytes(value: Uint8Array): boolean {
  return value.length >= 4
    && value.length <= PHOTO_MAX_FILE_BYTES
    && value[0] === 0xff
    && value[1] === 0xd8
    && value[value.length - 2] === 0xff
    && value[value.length - 1] === 0xd9;
}

export function isValidPhotoUniqueId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

export function createPendingPhotoRequest(
  purpose: PhotoPurpose,
  requestId: string,
  requestedAt: number
): PendingPhotoRequest {
  if (!isPhotoPurpose(purpose)) throw new TypeError('Pending photo purpose is invalid.');
  if (!isValidPhotoUniqueId(requestId)) throw new TypeError('Pending photo request id is invalid.');
  if (!Number.isSafeInteger(requestedAt) || requestedAt < 0) {
    throw new RangeError('Pending photo request time is invalid.');
  }
  return { version: 1, purpose, requestId, requestedAt };
}

/** Parse only a fresh request written immediately before opening Android's picker. */
export function parsePendingPhotoRequest(
  value: string | null,
  now: number = Date.now()
): PendingPhotoRequest | null {
  if (value == null || !Number.isSafeInteger(now) || now < 0) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      parsed.version !== 1
      || !isPhotoPurpose(parsed.purpose)
      || !isValidPhotoUniqueId(parsed.requestId)
      || !Number.isSafeInteger(parsed.requestedAt)
      || (parsed.requestedAt as number) < 0
      || (parsed.requestedAt as number) > now + 60_000
      || now - (parsed.requestedAt as number) > PENDING_PHOTO_REQUEST_TTL_MS
    ) return null;
    return {
      version: 1,
      purpose: parsed.purpose,
      requestId: parsed.requestId,
      requestedAt: parsed.requestedAt as number,
    };
  } catch {
    return null;
  }
}

/**
 * Build a portable path for SQLite and backups. The caller injects the unique
 * id so this pure helper remains deterministic and Node-testable.
 */
export function createManagedPhotoPath(purpose: PhotoPurpose, uniqueId: string): string {
  if (!isPhotoPurpose(purpose)) throw new TypeError('Photo purpose is invalid.');
  if (!isValidPhotoUniqueId(uniqueId)) throw new TypeError('Photo unique id must be a lowercase UUID v4.');
  return `${MANAGED_PHOTO_DIRECTORY}/${purpose}-${uniqueId}.jpg`;
}

/** Parse only paths created by ShopTrack; absolute and traversal paths fail. */
export function parseManagedPhotoPath(value: unknown): ManagedPhotoPath | null {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  const match = MANAGED_PHOTO_PATH.exec(value);
  if (!match) return null;
  return {
    purpose: match[1] as PhotoPurpose,
    uniqueId: match[2],
    path: value,
  };
}

export function isManagedPhotoPath(value: unknown): value is string {
  return parseManagedPhotoPath(value) !== null;
}

export function validateManagedPhotoPath(value: unknown): string {
  if (!isManagedPhotoPath(value)) {
    throw new TypeError('Photo path is not a ShopTrack-managed relative JPEG path.');
  }
  return value;
}

/** Return only app-managed files that no database record owns. */
export function findOrphanedPhotoPaths(
  storedPaths: readonly unknown[],
  referencedPaths: readonly unknown[]
): string[] {
  const referenced = new Set(
    referencedPaths.flatMap(path => {
      const parsed = parseManagedPhotoPath(path);
      return parsed ? [parsed.path] : [];
    })
  );
  return [...new Set(storedPaths.flatMap(path => {
    const parsed = parseManagedPhotoPath(path);
    return parsed && !referenced.has(parsed.path) ? [parsed.path] : [];
  }))].sort();
}

function assertDimension(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

/** Preserve aspect ratio, never upscale, and cap the longest edge at 800 px. */
export function planPhotoResize(width: number, height: number): PhotoResizePlan {
  assertDimension(width, 'Photo width');
  assertDimension(height, 'Photo height');

  const longEdge = Math.max(width, height);
  if (longEdge <= PHOTO_MAX_LONG_EDGE) return { width, height, resize: null };

  const scale = PHOTO_MAX_LONG_EDGE / longEdge;
  if (width >= height) {
    return {
      width: PHOTO_MAX_LONG_EDGE,
      height: Math.max(1, Math.round(height * scale)),
      resize: { width: PHOTO_MAX_LONG_EDGE },
    };
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: PHOTO_MAX_LONG_EDGE,
    resize: { height: PHOTO_MAX_LONG_EDGE },
  };
}
