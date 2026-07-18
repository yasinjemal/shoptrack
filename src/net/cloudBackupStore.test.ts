import assert from 'node:assert/strict';

import type { EncryptedBackupEnvelope } from '../core/encryption';
import {
  createConfiguredCloudBackupStore,
  HttpCloudBackupStore,
  SupabaseCloudBackupStore,
} from './cloudBackupStore';

const envelope: EncryptedBackupEnvelope = {
  format: 1,
  cipher: 'xchacha20-poly1305',
  kdf: { name: 'scrypt', salt: 'salt', N: 2 ** 15, r: 8, p: 1 },
  nonce: 'nonce',
  ciphertext: 'ciphertext',
  backup_format_version: 7,
  created_at: '2026-07-18T00:00:00.000Z',
};

async function run(): Promise<void> {
  console.log('TEST: HTTP cloud store PUT contract');
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const store = new HttpCloudBackupStore('https://backup.example.test/objects///', request);

  await store.put('shop/key ?#', envelope);
  assert.equal(String(calls[0].input), 'https://backup.example.test/objects/shop%2Fkey%20%3F%23');
  assert.equal(calls[0].init?.method, 'PUT');
  assert.deepEqual(calls[0].init?.headers, { 'Content-Type': 'application/json' });
  assert.equal(calls[0].init?.body, JSON.stringify(envelope));

  console.log('TEST: HTTP cloud store GET contract');
  const getCalls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const getRequest = (async (input: RequestInfo | URL, init?: RequestInit) => {
    getCalls.push({ input, init });
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  const getStore = new HttpCloudBackupStore('https://backup.example.test/objects/', getRequest);
  assert.deepEqual(await getStore.get('abc 123'), envelope);
  assert.equal(String(getCalls[0].input), 'https://backup.example.test/objects/abc%20123');
  assert.equal(getCalls[0].init?.method, 'GET');
  assert.deepEqual(getCalls[0].init?.headers, { Accept: 'application/json' });
  assert.equal(getCalls[0].init?.body, undefined);

  console.log('TEST: HTTP cloud store surfaces protocol and payload errors');
  const putFailure = new HttpCloudBackupStore(
    'https://backup.example.test',
    (async () => new Response('busy', { status: 503 })) as typeof fetch
  );
  await assert.rejects(putFailure.put('id', envelope), /upload failed \(503\)/);

  const getFailure = new HttpCloudBackupStore(
    'https://backup.example.test',
    (async () => new Response('forbidden', { status: 403 })) as typeof fetch
  );
  await assert.rejects(getFailure.get('id'), /download failed \(403\)/);

  const invalidJson = new HttpCloudBackupStore(
    'https://backup.example.test',
    (async () => new Response('{not-json', { status: 200 })) as typeof fetch
  );
  await assert.rejects(invalidJson.get('id'), SyntaxError);

  const networkError = new Error('offline');
  const offline = new HttpCloudBackupStore(
    'https://backup.example.test',
    (async () => { throw networkError; }) as typeof fetch
  );
  await assert.rejects(offline.put('id', envelope), error => error === networkError);

  console.log('TEST: Supabase store PUT is an authenticated storage upsert');
  const supaCalls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const supaRequest = (async (input: RequestInfo | URL, init?: RequestInit) => {
    supaCalls.push({ input, init });
    return new Response(JSON.stringify({ Key: 'shop-backups/id' }), { status: 200 });
  }) as typeof fetch;
  const supabase = new SupabaseCloudBackupStore(
    'https://project.supabase.co///',
    'anon-key',
    'shop-backups',
    supaRequest
  );

  await supabase.put('shop/key ?#', envelope);
  assert.equal(
    String(supaCalls[0].input),
    'https://project.supabase.co/storage/v1/object/shop-backups/shop%2Fkey%20%3F%23'
  );
  assert.equal(supaCalls[0].init?.method, 'POST');
  assert.deepEqual(supaCalls[0].init?.headers, {
    Authorization: 'Bearer anon-key',
    apikey: 'anon-key',
    'Content-Type': 'application/json',
    'x-upsert': 'true',
  });
  assert.equal(supaCalls[0].init?.body, JSON.stringify(envelope));

  console.log('TEST: Supabase store GET is authenticated and returns the envelope');
  const supaGetCalls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const supaGetRequest = (async (input: RequestInfo | URL, init?: RequestInit) => {
    supaGetCalls.push({ input, init });
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  const supabaseGet = new SupabaseCloudBackupStore(
    'https://project.supabase.co',
    'anon-key',
    'shop-backups',
    supaGetRequest
  );
  assert.deepEqual(await supabaseGet.get('abc 123'), envelope);
  assert.equal(
    String(supaGetCalls[0].input),
    'https://project.supabase.co/storage/v1/object/shop-backups/abc%20123'
  );
  assert.equal(supaGetCalls[0].init?.method, 'GET');
  assert.deepEqual(supaGetCalls[0].init?.headers, {
    Authorization: 'Bearer anon-key',
    apikey: 'anon-key',
    Accept: 'application/json',
  });
  assert.equal(supaGetCalls[0].init?.body, undefined);

  console.log('TEST: Supabase store surfaces protocol errors and offline failure');
  const supaDenied = new SupabaseCloudBackupStore(
    'https://project.supabase.co',
    'anon-key',
    'shop-backups',
    (async () => new Response('denied', { status: 403 })) as typeof fetch
  );
  await assert.rejects(supaDenied.put('id', envelope), /upload failed \(403\)/);
  await assert.rejects(supaDenied.get('id'), /download failed \(403\)/);

  const supaOffline = new SupabaseCloudBackupStore(
    'https://project.supabase.co',
    'anon-key',
    'shop-backups',
    (async () => { throw networkError; }) as typeof fetch
  );
  await assert.rejects(supaOffline.get('id'), error => error === networkError);

  console.log('TEST: configuration picks Supabase first, generic second, off last');
  const supabaseConfigured = createConfiguredCloudBackupStore({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    genericUrl: 'https://backup.example.test/objects',
  });
  assert.ok(supabaseConfigured instanceof SupabaseCloudBackupStore);

  const genericConfigured = createConfiguredCloudBackupStore({
    genericUrl: 'https://backup.example.test/objects',
  });
  assert.ok(genericConfigured instanceof HttpCloudBackupStore);

  const halfConfigured = createConfiguredCloudBackupStore({
    supabaseUrl: 'https://project.supabase.co',
    genericUrl: 'https://backup.example.test/objects',
  });
  assert.ok(
    halfConfigured instanceof HttpCloudBackupStore,
    'a Supabase URL without its key must not select the Supabase store'
  );

  assert.equal(createConfiguredCloudBackupStore({}), null);
}

void run().then(() => console.log('cloud backup store contract tests passed'));
