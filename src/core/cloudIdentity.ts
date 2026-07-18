export const CLOUD_IDENTITY_FORMAT = 1 as const;
export const CLOUD_SHOP_BLOB_LOCATION_FORMAT = 1 as const;

export interface CloudIdentity {
  /** Versioned, deliberately credential-free account identity. */
  readonly format: typeof CLOUD_IDENTITY_FORMAT;
  /** Stable provider identifier such as `google`, never a display name. */
  readonly provider: string;
  /** Opaque provider subject/account reference, never an email address. */
  readonly subject: string;
}

/**
 * Provider-neutral authentication boundary.
 *
 * A platform adapter may later implement this with Google, phone OTP, or
 * another provider. Core treats every response as untrusted and never asks
 * for sign-in while merely reading the current session. That keeps an account
 * an explicit, optional cloud action rather than an app-start requirement.
 */
export interface CloudIdentityProvider {
  getCurrentIdentity(): Promise<unknown>;
  signIn(): Promise<unknown>;
  signOut(): Promise<void>;
}

export type CloudIdentityFailureReason = 'provider-error' | 'invalid-session';

export type CloudIdentityState =
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticated'; readonly identity: CloudIdentity }
  | {
      readonly status: 'unavailable';
      readonly reason: CloudIdentityFailureReason;
    };

export interface CloudShopBlobLocation {
  readonly format: typeof CLOUD_SHOP_BLOB_LOCATION_FORMAT;
  /** Opaque object-store key for encrypted bytes; it is not an encryption key. */
  readonly objectId: string;
}

/**
 * Authenticated backend boundary that maps an account to its encrypted shop
 * blob. A real adapter remains responsible for authorizing the current
 * provider session server-side; the recovery phrase remains separate.
 */
export interface CloudShopBlobLocator {
  locate(identity: CloudIdentity): Promise<unknown>;
}

export type CloudShopBlobResolution =
  | { readonly status: 'anonymous' }
  | {
      readonly status: 'identity-unavailable';
      readonly reason: CloudIdentityFailureReason;
    }
  | { readonly status: 'not-linked' }
  | { readonly status: 'linked'; readonly location: CloudShopBlobLocation }
  | {
      readonly status: 'locator-unavailable';
      readonly reason: 'locator-error' | 'invalid-location';
    };

const ANONYMOUS_STATE: CloudIdentityState = Object.freeze({ status: 'anonymous' });
const PROVIDER_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function parseIdentity(value: unknown): CloudIdentityState {
  // Only an explicit null means "no account". Undefined/malformed provider
  // output must not silently downgrade a broken session to anonymous.
  if (value === null) return ANONYMOUS_STATE;
  if (!value || typeof value !== 'object') {
    return { status: 'unavailable', reason: 'invalid-session' };
  }

  const candidate = value as Partial<CloudIdentity>;
  if (
    candidate.format !== CLOUD_IDENTITY_FORMAT
    || typeof candidate.provider !== 'string'
    || !PROVIDER_PATTERN.test(candidate.provider)
    || typeof candidate.subject !== 'string'
    || candidate.subject.length < 1
    || candidate.subject.length > 256
    || candidate.subject.trim() !== candidate.subject
    || candidate.subject.includes('@')
    || CONTROL_CHARACTER_PATTERN.test(candidate.subject)
  ) {
    return { status: 'unavailable', reason: 'invalid-session' };
  }

  // Copy only the non-secret fields. Provider tokens, profile data, or other
  // accidental properties never cross into core state.
  return {
    status: 'authenticated',
    identity: Object.freeze({
      format: CLOUD_IDENTITY_FORMAT,
      provider: candidate.provider,
      subject: candidate.subject,
    }),
  };
}

function parseLocation(value: unknown): CloudShopBlobLocation | null | undefined {
  // Likewise, only explicit null means the authenticated account is unlinked.
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;

  const candidate = value as Partial<CloudShopBlobLocation>;
  if (
    candidate.format !== CLOUD_SHOP_BLOB_LOCATION_FORMAT
    || typeof candidate.objectId !== 'string'
    || !OBJECT_ID_PATTERN.test(candidate.objectId)
  ) return undefined;

  return Object.freeze({
    format: CLOUD_SHOP_BLOB_LOCATION_FORMAT,
    objectId: candidate.objectId,
  });
}

/** Read an existing optional session. This never starts an interactive sign-in. */
export async function getCurrentCloudIdentity(
  provider: CloudIdentityProvider
): Promise<CloudIdentityState> {
  try {
    return parseIdentity(await provider.getCurrentIdentity());
  } catch {
    return { status: 'unavailable', reason: 'provider-error' };
  }
}

/** Invoke sign-in only after an explicit owner action and sanitize its result. */
export async function requestCloudSignIn(
  provider: CloudIdentityProvider
): Promise<CloudIdentityState> {
  try {
    return parseIdentity(await provider.signIn());
  } catch {
    return { status: 'unavailable', reason: 'provider-error' };
  }
}

/** Sign out without allowing a provider failure to masquerade as anonymous. */
export async function requestCloudSignOut(
  provider: CloudIdentityProvider
): Promise<CloudIdentityState> {
  try {
    await provider.signOut();
    return ANONYMOUS_STATE;
  } catch {
    return { status: 'unavailable', reason: 'provider-error' };
  }
}

/**
 * Resolve the encrypted blob for an existing session without ever triggering
 * sign-in. Anonymous/offline states make no locator request; every malformed
 * or failed boundary response fails closed.
 */
export async function resolveCloudShopBlob(
  provider: CloudIdentityProvider,
  locator: CloudShopBlobLocator
): Promise<CloudShopBlobResolution> {
  const state = await getCurrentCloudIdentity(provider);
  if (state.status === 'anonymous') return { status: 'anonymous' };
  if (state.status === 'unavailable') {
    return { status: 'identity-unavailable', reason: state.reason };
  }

  let rawLocation: unknown;
  try {
    rawLocation = await locator.locate(state.identity);
  } catch {
    return { status: 'locator-unavailable', reason: 'locator-error' };
  }

  const location = parseLocation(rawLocation);
  if (location === null) return { status: 'not-linked' };
  if (location === undefined) {
    return { status: 'locator-unavailable', reason: 'invalid-location' };
  }
  return { status: 'linked', location };
}
