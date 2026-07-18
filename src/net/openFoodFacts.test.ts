/** Run with: npx tsx src/net/openFoodFacts.test.ts */

import {
  AsyncStorageOpenFoodFactsCache,
  OPEN_FOOD_FACTS_CACHE_VERSION,
  OPEN_FOOD_FACTS_USER_AGENT,
  buildOpenFoodFactsUrl,
  lookupOpenFoodFactsProduct,
  normalizeOpenFoodFactsBarcode,
  parseOpenFoodFactsResponse,
  type OpenFoodFactsCache,
  type OpenFoodFactsFetch,
  type OpenFoodFactsProduct,
} from './openFoodFacts';

let failures = 0;

function equal(actual: unknown, expected: unknown, label: string) {
  if (Object.is(actual, expected)) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(
      `  FAIL ${label}\n         expected: ${String(expected)}\n         actual:   ${String(actual)}`
    );
  }
}

function deepEqual(actual: unknown, expected: unknown, label: string) {
  equal(JSON.stringify(actual), JSON.stringify(expected), label);
}

class MemoryCache implements OpenFoodFactsCache {
  readonly products = new Map<string, OpenFoodFactsProduct>();
  writes: OpenFoodFactsProduct[] = [];

  async get(barcode: string): Promise<OpenFoodFactsProduct | null> {
    return this.products.get(barcode) ?? null;
  }

  async set(product: OpenFoodFactsProduct): Promise<void> {
    this.writes.push(product);
    this.products.set(product.barcode, product);
  }
}

function responseWith(payload: unknown, ok = true): OpenFoodFactsFetch {
  return async () => ({
    ok,
    json: async () => payload,
  });
}

const barcode = '3017620422003';
const foundPayload = {
  code: barcode,
  status: 1,
  status_verbose: 'product found',
  product: {
    _id: barcode,
    product_name: '  Nutella  ',
    generic_name: 'Hazelnut cocoa spread',
    brands: '  Ferrero  ',
    quantity: '  400 g  ',
  },
};

async function run() {
  console.log('========================================');
  console.log('TEST: barcode normalization and URL');
  console.log('========================================');

  equal(normalizeOpenFoodFactsBarcode(' 3017620422003 '), barcode, 'scanner whitespace is trimmed');
  equal(normalizeOpenFoodFactsBarcode('034000470693'), '0034000470693', 'UPC-A is normalized to EAN-13');
  equal(normalizeOpenFoodFactsBarcode('4003'), '00004003', 'short code follows OFF padding');
  equal(normalizeOpenFoodFactsBarcode('3017-6204'), null, 'punctuation is rejected');
  equal(normalizeOpenFoodFactsBarcode('123'), null, 'implausibly short input is rejected');
  equal(normalizeOpenFoodFactsBarcode('123456789012345'), null, 'overlong input is rejected');

  const url = buildOpenFoodFactsUrl(barcode);
  equal(
    url,
    'https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=code%2Cproduct_name%2Cgeneric_name%2Cbrands%2Cquantity',
    'URL uses the v2 product endpoint and limits fields'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: strict v2 response parser');
  console.log('========================================');

  deepEqual(
    parseOpenFoodFactsResponse(foundPayload, barcode),
    { barcode, name: 'Nutella', brands: 'Ferrero', quantity: '400 g' },
    'real-shaped found payload is trimmed and parsed'
  );
  deepEqual(
    parseOpenFoodFactsResponse({
      code: barcode,
      status: 1,
      product: { product_name: '   ', generic_name: '  Cocoa spread  ' },
    }, barcode),
    { barcode, name: 'Cocoa spread' },
    'generic name is the fallback when product name is blank'
  );
  equal(
    parseOpenFoodFactsResponse({ code: barcode, status: 0, product: {} }, barcode),
    null,
    'status zero is a clean miss'
  );
  equal(
    parseOpenFoodFactsResponse({ code: barcode, status: 1, product: { brands: 'No name' } }, barcode),
    null,
    'a found record without a name is not invented'
  );
  equal(parseOpenFoodFactsResponse([], barcode), null, 'array payload is malformed');
  equal(
    parseOpenFoodFactsResponse({ code: '5449000000996', status: 1, product: { product_name: 'Other' } }, barcode),
    null,
    'a mismatched response barcode is rejected'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: versioned persistent cache');
  console.log('========================================');

  const stored = new Map<string, string>();
  const storage = {
    async getItem(key: string) { return stored.get(key) ?? null; },
    async setItem(key: string, value: string) { stored.set(key, value); },
  };
  const persistentCache = new AsyncStorageOpenFoodFactsCache(storage);
  const cachedProduct = { barcode, name: 'Nutella', brands: 'Ferrero' };
  await persistentCache.set(cachedProduct);
  deepEqual(await persistentCache.get(barcode), cachedProduct, 'current cache entry round-trips');

  const cacheKey = [...stored.keys()][0];
  stored.set(cacheKey, JSON.stringify({
    version: OPEN_FOOD_FACTS_CACHE_VERSION - 1,
    product: cachedProduct,
  }));
  equal(await persistentCache.get(barcode), null, 'old cache version is ignored');
  stored.set(cacheKey, '{broken json');
  equal(await persistentCache.get(barcode), null, 'corrupt cache JSON is ignored');

  console.log('');
  console.log('========================================');
  console.log('TEST: cache-first, failure-safe lookup');
  console.log('========================================');

  const offlineCache = new MemoryCache();
  offlineCache.products.set(barcode, cachedProduct);
  let offlineRequests = 0;
  const cachedResult = await lookupOpenFoodFactsProduct(barcode, {
    cache: offlineCache,
    request: async () => {
      offlineRequests++;
      throw new Error('offline');
    },
  });
  deepEqual(cachedResult, cachedProduct, 'cache hit resolves while network is offline');
  equal(offlineRequests, 0, 'cache hit does not attempt fetch');

  const networkCache = new MemoryCache();
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const networkResult = await lookupOpenFoodFactsProduct(barcode, {
    cache: networkCache,
    request: async (input, init) => {
      requestedUrl = input;
      requestedInit = init;
      return { ok: true, json: async () => foundPayload };
    },
  });
  deepEqual(
    networkResult,
    { barcode, name: 'Nutella', brands: 'Ferrero', quantity: '400 g' },
    'network found product is returned'
  );
  equal(networkCache.writes.length, 1, 'valid found product is cached once');
  equal(requestedUrl, url, 'lookup requests the limited-fields URL');
  equal(
    (requestedInit?.headers as Record<string, string> | undefined)?.['User-Agent'],
    OPEN_FOOD_FACTS_USER_AGENT,
    'request identifies ShopTrack'
  );
  equal(requestedInit?.signal instanceof AbortSignal, true, 'request receives an abort signal');

  const invalidCache = new MemoryCache();
  let invalidRequests = 0;
  equal(
    await lookupOpenFoodFactsProduct('not-a-barcode', {
      cache: invalidCache,
      request: async () => {
        invalidRequests++;
        throw new Error('must not run');
      },
    }),
    null,
    'invalid barcode is a safe miss'
  );
  equal(invalidRequests, 0, 'invalid barcode does not fetch');

  const misses: [string, OpenFoodFactsFetch][] = [
    ['status zero', responseWith({ code: barcode, status: 0 })],
    ['HTTP error', responseWith({}, false)],
    ['malformed payload', responseWith({ code: barcode, status: 1, product: null })],
    ['network error', async () => { throw new Error('offline'); }],
    ['JSON error', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })],
  ];

  for (const [label, request] of misses) {
    const cache = new MemoryCache();
    equal(
      await lookupOpenFoodFactsProduct(barcode, { cache, request }),
      null,
      `${label} returns null`
    );
    equal(cache.writes.length, 0, `${label} is not cached`);
  }

  const timeoutCache = new MemoryCache();
  const timeoutResult = await lookupOpenFoodFactsProduct(barcode, {
    cache: timeoutCache,
    timeoutMs: 1,
    request: async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new Error('aborted by timeout')),
        { once: true }
      );
    }),
  });
  equal(timeoutResult, null, 'timeout aborts as a safe miss');
  equal(timeoutCache.writes.length, 0, 'timeout is not cached');
}

run().then(() => {
  if (failures > 0) {
    console.error(`\n${failures} Open Food Facts test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll Open Food Facts tests passed.');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
