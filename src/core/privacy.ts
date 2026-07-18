/** Privacy boundary for remote crash events. Local crash records stay richer. */

export interface CrashEventLike {
  message?: string;
  user?: unknown;
  request?: unknown;
  breadcrumbs?: unknown[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, string>;
  transaction?: string;
  fingerprint?: string[];
  exception?: {
    values?: {
      type?: string;
      value?: string;
      stacktrace?: unknown;
      mechanism?: unknown;
      [key: string]: unknown;
    }[];
  };
  [key: string]: unknown;
}

/**
 * Keep only error type and stack frames. Customer/product names and money can
 * appear in messages, breadcrumbs, route context, extras, or tags, so all of
 * those channels are removed rather than relying on fragile regexes.
 */
export function sanitiseCrashEvent<T extends Record<string, any>>(event: T): T {
  const clean: CrashEventLike = { ...event };
  delete clean.message;
  delete clean.user;
  delete clean.request;
  delete clean.breadcrumbs;
  delete clean.extra;
  delete clean.contexts;
  delete clean.tags;
  delete clean.transaction;
  clean.fingerprint = ['shoptrack-error-type'];

  if (clean.exception?.values) {
    clean.exception = {
      values: clean.exception.values.map(value => ({
        type: value.type ?? 'Error',
        value: 'ShopTrack error',
        stacktrace: value.stacktrace,
      })),
    };
  }
  return clean as T;
}
