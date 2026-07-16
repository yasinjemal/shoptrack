/** Pure data-safety helpers; platform storage lives in src/app/dataSafety.ts. */

export interface CrashRecord {
  message: string;
  stack: string | null;
  build_version: string;
  occurred_at: number;
  fatal: boolean;
}

export function createCrashRecord(
  value: unknown,
  buildVersion: string,
  occurredAt: number = Date.now(),
  fatal = true
): CrashRecord {
  const error = value instanceof Error ? value : new Error(String(value));
  return {
    message: error.message || error.name || 'Unknown error',
    stack: typeof error.stack === 'string' ? error.stack : null,
    build_version: buildVersion,
    occurred_at: occurredAt,
    fatal,
  };
}

export function parseCrashRecord(value: string | null): CrashRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CrashRecord>;
    if (
      typeof parsed.message !== 'string' ||
      typeof parsed.build_version !== 'string' ||
      typeof parsed.occurred_at !== 'number' ||
      typeof parsed.fatal !== 'boolean'
    ) return null;
    return {
      message: parsed.message,
      stack: typeof parsed.stack === 'string' ? parsed.stack : null,
      build_version: parsed.build_version,
      occurred_at: parsed.occurred_at,
      fatal: parsed.fatal,
    };
  } catch {
    return null;
  }
}

export function localDayKey(at: number | Date): string {
  const d = at instanceof Date ? at : new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyBackupFilename(at: number | Date): string {
  return `shoptrack-auto-${localDayKey(at)}.json`;
}

/** Oldest files beyond the retention count, independent of input order. */
export function backupFilesToDelete(fileUris: string[], keep = 7): string[] {
  return [...fileUris].sort().slice(0, Math.max(0, fileUris.length - keep));
}

export function isSharedBackupDue(lastSharedAt: number | null, now = Date.now()): boolean {
  return lastSharedAt == null || now - lastSharedAt >= 7 * 24 * 60 * 60 * 1000;
}

