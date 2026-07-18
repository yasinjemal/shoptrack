import AsyncStorage from '@react-native-async-storage/async-storage';

const OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OPEN_FOOD_FACTS_FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'quantity',
] as const;

export const OPEN_FOOD_FACTS_USER_AGENT =
  'ShopTrack/1.0.1 (https://github.com/yasinjemal/shoptrack)';
export const OPEN_FOOD_FACTS_CACHE_VERSION = 1;
export const OPEN_FOOD_FACTS_TIMEOUT_MS = 6_000;

const MAX_TIMEOUT_MS = 15_000;
const CACHE_KEY_PREFIX = '@shoptrack/open-food-facts:';

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brands?: string;
  quantity?: string;
}

export interface OpenFoodFactsCache {
  get(barcode: string): Promise<OpenFoodFactsProduct | null>;
  set(product: OpenFoodFactsProduct): Promise<void>;
}

export interface OpenFoodFactsFetchResponse {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type OpenFoodFactsFetch = (
  input: string,
  init?: RequestInit
) => Promise<OpenFoodFactsFetchResponse>;

interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface CachedProductEnvelope {
  version: typeof OPEN_FOOD_FACTS_CACHE_VERSION;
  product: OpenFoodFactsProduct;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Apply Open Food Facts' documented leading-zero normalization to numeric
 * product codes. Scanner whitespace is harmless; other separators are not.
 */
export function normalizeOpenFoodFactsBarcode(value: string): string | null {
  if (typeof value !== 'string') return null;

  const barcode = value.trim();
  if (!/^\d{4,14}$/.test(barcode)) return null;

  const significantDigits = barcode.replace(/^0+/, '');
  if (significantDigits.length === 0 || significantDigits.length > 14) return null;

  if (significantDigits.length <= 7) return significantDigits.padStart(8, '0');
  if (significantDigits.length === 8) return significantDigits;
  if (significantDigits.length <= 12) return significantDigits.padStart(13, '0');
  return significantDigits;
}

function normalizeProduct(
  value: unknown,
  expectedBarcode: string
): OpenFoodFactsProduct | null {
  if (!isRecord(value)) return null;

  const barcode = normalizeOpenFoodFactsBarcode(
    typeof value.barcode === 'string' ? value.barcode : ''
  );
  const name = cleanText(value.name);
  if (barcode !== expectedBarcode || !name) return null;

  if (value.brands !== undefined && typeof value.brands !== 'string') return null;
  if (value.quantity !== undefined && typeof value.quantity !== 'string') return null;

  const brands = cleanText(value.brands);
  const quantity = cleanText(value.quantity);

  return {
    barcode,
    name,
    ...(brands ? { brands } : {}),
    ...(quantity ? { quantity } : {}),
  };
}

/** Parse only a found v2 product whose returned code matches the requested one. */
export function parseOpenFoodFactsResponse(
  value: unknown,
  requestedBarcode: string
): OpenFoodFactsProduct | null {
  const barcode = normalizeOpenFoodFactsBarcode(requestedBarcode);
  if (!barcode || !isRecord(value) || value.status !== 1 || !isRecord(value.product)) {
    return null;
  }

  const responseBarcode = normalizeOpenFoodFactsBarcode(
    typeof value.code === 'string' ? value.code : ''
  );
  if (responseBarcode !== barcode) return null;

  const name = cleanText(value.product.product_name)
    ?? cleanText(value.product.generic_name);
  if (!name) return null;

  const brands = cleanText(value.product.brands);
  const quantity = cleanText(value.product.quantity);

  return {
    barcode,
    name,
    ...(brands ? { brands } : {}),
    ...(quantity ? { quantity } : {}),
  };
}

export function buildOpenFoodFactsUrl(barcodeValue: string): string | null {
  const barcode = normalizeOpenFoodFactsBarcode(barcodeValue);
  if (!barcode) return null;

  const fields = encodeURIComponent(OPEN_FOOD_FACTS_FIELDS.join(','));
  return `${OPEN_FOOD_FACTS_BASE_URL}/${encodeURIComponent(barcode)}.json?fields=${fields}`;
}

/** Versioned persistent cache. Invalid JSON and old/corrupt entries are misses. */
export class AsyncStorageOpenFoodFactsCache implements OpenFoodFactsCache {
  constructor(private readonly storage: KeyValueStorage = AsyncStorage) {}

  private key(barcode: string): string | null {
    const normalized = normalizeOpenFoodFactsBarcode(barcode);
    return normalized ? `${CACHE_KEY_PREFIX}${normalized}` : null;
  }

  async get(barcodeValue: string): Promise<OpenFoodFactsProduct | null> {
    const barcode = normalizeOpenFoodFactsBarcode(barcodeValue);
    const key = this.key(barcodeValue);
    if (!barcode || !key) return null;

    const serialized = await this.storage.getItem(key);
    if (!serialized) return null;

    try {
      const envelope: unknown = JSON.parse(serialized);
      if (
        !isRecord(envelope)
        || envelope.version !== OPEN_FOOD_FACTS_CACHE_VERSION
      ) {
        return null;
      }
      return normalizeProduct(envelope.product, barcode);
    } catch {
      return null;
    }
  }

  async set(productValue: OpenFoodFactsProduct): Promise<void> {
    const barcode = normalizeOpenFoodFactsBarcode(productValue.barcode);
    const product = barcode ? normalizeProduct(productValue, barcode) : null;
    const key = barcode ? this.key(barcode) : null;
    if (!product || !key) return;

    const envelope: CachedProductEnvelope = {
      version: OPEN_FOOD_FACTS_CACHE_VERSION,
      product,
    };
    await this.storage.setItem(key, JSON.stringify(envelope));
  }
}

export const defaultOpenFoodFactsCache = new AsyncStorageOpenFoodFactsCache();

export interface OpenFoodFactsLookupOptions {
  cache?: OpenFoodFactsCache;
  request?: OpenFoodFactsFetch;
  timeoutMs?: number;
}

function boundedTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return OPEN_FOOD_FACTS_TIMEOUT_MS;
  }
  return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
}

/**
 * Resolve a product from the offline cache first and then Open Food Facts.
 * Every expected cache/network/data failure is a safe miss for Add Product.
 */
export async function lookupOpenFoodFactsProduct(
  barcodeValue: string,
  options: OpenFoodFactsLookupOptions = {}
): Promise<OpenFoodFactsProduct | null> {
  const barcode = normalizeOpenFoodFactsBarcode(barcodeValue);
  const url = buildOpenFoodFactsUrl(barcodeValue);
  if (!barcode || !url) return null;

  const cache = options.cache ?? defaultOpenFoodFactsCache;
  try {
    const cached = normalizeProduct(await cache.get(barcode), barcode);
    if (cached) return cached;
  } catch {
    // A local cache problem must not disable a live lookup.
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), boundedTimeout(options.timeoutMs));

  try {
    const request: OpenFoodFactsFetch = options.request
      ?? ((input, init) => fetch(input, init));
    const response = await request(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const product = parseOpenFoodFactsResponse(await response.json(), barcode);
    if (!product) return null;

    try {
      await cache.set(product);
    } catch {
      // The useful network result survives a full or unavailable local cache.
    }
    return product;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
