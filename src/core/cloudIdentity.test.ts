import assert from 'node:assert/strict';

import {
  CLOUD_IDENTITY_FORMAT,
  CLOUD_SHOP_BLOB_LOCATION_FORMAT,
  getCurrentCloudIdentity,
  requestCloudSignIn,
  requestCloudSignOut,
  resolveCloudShopBlob,
  type CloudIdentity,
  type CloudIdentityProvider,
  type CloudShopBlobLocator,
} from './cloudIdentity';

const IDENTITY: CloudIdentity = {
  format: CLOUD_IDENTITY_FORMAT,
  provider: 'test-provider',
  subject: 'opaque-account-42',
};
const OBJECT_ID = 'Z3Vlc3Mtbm90LWEtcmVhbC1rZXk_42';

function identityProvider(overrides: Partial<CloudIdentityProvider> = {}): CloudIdentityProvider {
  return {
    getCurrentIdentity: async () => null,
    signIn: async () => IDENTITY,
    signOut: async () => undefined,
    ...overrides,
  };
}

async function run(): Promise<void> {
  console.log('TEST: anonymous use never starts sign-in or contacts the blob locator');
  let signIns = 0;
  let locatorCalls = 0;
  const anonymousProvider = identityProvider({
    signIn: async () => { signIns += 1; return IDENTITY; },
  });
  const countingLocator: CloudShopBlobLocator = {
    locate: async () => {
      locatorCalls += 1;
      return { format: CLOUD_SHOP_BLOB_LOCATION_FORMAT, objectId: OBJECT_ID };
    },
  };
  assert.deepEqual(await getCurrentCloudIdentity(anonymousProvider), { status: 'anonymous' });
  assert.deepEqual(
    await resolveCloudShopBlob(anonymousProvider, countingLocator),
    { status: 'anonymous' }
  );
  assert.equal(signIns, 0);
  assert.equal(locatorCalls, 0);

  console.log('TEST: offline and malformed provider sessions fail closed');
  const offlineProvider = identityProvider({
    getCurrentIdentity: async () => { throw new Error('offline'); },
  });
  assert.deepEqual(
    await resolveCloudShopBlob(offlineProvider, countingLocator),
    { status: 'identity-unavailable', reason: 'provider-error' }
  );
  assert.equal(locatorCalls, 0);

  const malformedSessions: unknown[] = [
    undefined,
    'authenticated',
    { format: 2, provider: 'test-provider', subject: 'opaque-account-42' },
    { format: 1, provider: 'Test Provider', subject: 'opaque-account-42' },
    { format: 1, provider: 'test-provider', subject: ' account-with-spaces ' },
    { format: 1, provider: 'test-provider', subject: 'account\nwith-control' },
    { format: 1, provider: 'test-provider', subject: 'email@example.invalid' },
  ];
  for (const session of malformedSessions) {
    assert.deepEqual(
      await getCurrentCloudIdentity(identityProvider({
        getCurrentIdentity: async () => session,
      })),
      { status: 'unavailable', reason: 'invalid-session' }
    );
  }

  console.log('TEST: sign-in is explicit and core retains no credentials or profile data');
  const signedIn = await requestCloudSignIn(identityProvider({
    signIn: async () => ({
      ...IDENTITY,
      email: 'must-not-enter-core@example.invalid',
      accessToken: 'must-not-enter-core',
    }),
  }));
  assert.deepEqual(signedIn, { status: 'authenticated', identity: IDENTITY });
  assert.equal('email' in (signedIn.status === 'authenticated' ? signedIn.identity : {}), false);
  assert.equal('accessToken' in (signedIn.status === 'authenticated' ? signedIn.identity : {}), false);
  assert.deepEqual(
    await requestCloudSignIn(identityProvider({
      signIn: async () => { throw new Error('cancelled or offline'); },
    })),
    { status: 'unavailable', reason: 'provider-error' }
  );

  console.log('TEST: a valid session can locate only an opaque encrypted blob ID');
  let locatedIdentity: CloudIdentity | null = null;
  const authenticatedProvider = identityProvider({
    getCurrentIdentity: async () => IDENTITY,
    signIn: async () => { throw new Error('must not be called by resolution'); },
  });
  const linked = await resolveCloudShopBlob(authenticatedProvider, {
    locate: async identity => {
      locatedIdentity = identity;
      return {
        format: CLOUD_SHOP_BLOB_LOCATION_FORMAT,
        objectId: OBJECT_ID,
        recoveryPhrase: 'must-not-enter-core-location',
      };
    },
  });
  assert.deepEqual(locatedIdentity, IDENTITY);
  assert.deepEqual(linked, {
    status: 'linked',
    location: { format: CLOUD_SHOP_BLOB_LOCATION_FORMAT, objectId: OBJECT_ID },
  });
  assert.equal(
    'recoveryPhrase' in (linked.status === 'linked' ? linked.location : {}),
    false
  );

  console.log('TEST: unlinked, failed, and malformed locator results fail closed');
  assert.deepEqual(
    await resolveCloudShopBlob(authenticatedProvider, { locate: async () => null }),
    { status: 'not-linked' }
  );
  assert.deepEqual(
    await resolveCloudShopBlob(authenticatedProvider, {
      locate: async () => { throw new Error('backend unavailable'); },
    }),
    { status: 'locator-unavailable', reason: 'locator-error' }
  );
  for (const invalidLocation of [
    undefined,
    { format: 1, objectId: '../another-shop' },
    { format: 1, objectId: 'https://example.invalid/blob' },
    { format: 2, objectId: OBJECT_ID },
    { format: 1, objectId: 'short' },
  ]) {
    assert.deepEqual(
      await resolveCloudShopBlob(authenticatedProvider, {
        locate: async () => invalidLocation,
      }),
      { status: 'locator-unavailable', reason: 'invalid-location' }
    );
  }

  console.log('TEST: sign-out reports provider failure instead of claiming anonymity');
  assert.deepEqual(await requestCloudSignOut(identityProvider()), { status: 'anonymous' });
  assert.deepEqual(
    await requestCloudSignOut(identityProvider({
      signOut: async () => { throw new Error('provider unavailable'); },
    })),
    { status: 'unavailable', reason: 'provider-error' }
  );
}

void run().then(() => console.log('cloud identity contract tests passed'));
