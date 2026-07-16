import assert from 'node:assert/strict';

import {
  cloudObjectIdForPhrase,
  decryptBackupJson,
  encryptBackupJson,
  SCRYPT_N,
} from './encryption';

function deterministicRandom(): (length: number) => Uint8Array {
  let next = 1;
  return length => Uint8Array.from({ length }, () => next++ % 256);
}

async function run(): Promise<void> {
  const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
  const json = JSON.stringify({ backup_format_version: 5, data: { products: [{ id: 1 }] } });
  const envelope = await encryptBackupJson(
    json,
    phrase,
    5,
    deterministicRandom(),
    '2026-07-16T10:00:00.000Z'
  );

  assert.equal(envelope.cipher, 'xchacha20-poly1305');
  assert.equal(envelope.kdf.N, SCRYPT_N);
  assert.notEqual(envelope.ciphertext, json);
  assert.equal(await decryptBackupJson(envelope, `  ${phrase.toUpperCase()}  `), json);
  assert.equal(cloudObjectIdForPhrase(phrase), cloudObjectIdForPhrase(` ${phrase} `));
  assert.notEqual(cloudObjectIdForPhrase(phrase), cloudObjectIdForPhrase(`${phrase} zoo`));

  await assert.rejects(
    decryptBackupJson(envelope, 'legal winner thank year wave sausage worth useful legal winner thank yellow'),
    /wrong or.*damaged/
  );

  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
  await assert.rejects(decryptBackupJson(tampered, phrase), /wrong or.*damaged/);

  const hostile = {
    ...envelope,
    kdf: { ...envelope.kdf, N: 2 ** 20 },
  };
  await assert.rejects(decryptBackupJson(hostile, phrase), /not supported/);
}

void run().then(() => console.log('encryption tests passed'));
