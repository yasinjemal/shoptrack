import * as Sentry from '@sentry/react-native';
import { sanitiseCrashEvent } from '../core/privacy';

/**
 * Account-independent Sentry setup. Without a DSN this is a no-op; supplying
 * EXPO_PUBLIC_SENTRY_DSN activates offline-buffered delivery in a future build.
 */
export function initPrivacySafeCrashReporting(
  dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN
): boolean {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    attachStacktrace: true,
    beforeSend(event) {
      return sanitiseCrashEvent(event);
    },
  });
  return true;
}

