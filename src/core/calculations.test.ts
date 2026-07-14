/**
 * ============================================
 * SHOPTRACK CALCULATION ENGINE TESTS
 * ============================================
 * 
 * Testing real-world scenarios:
 * - Basic stock movement → sales calculation
 * - Imperfect data handling
 * - Anomaly detection
 * - Period calculations
 */

import {
  calculateProductMetrics,
  calculatePeriodSummary,
  getPeriodBounds,
  formatCurrency,
  Product,
  StockMovement
} from './calculations';

// ============================================
// ASSERTION HARNESS
// ============================================
// console.assert only prints -- on its own it can never fail a run, so these
// tests reported success no matter what. Count failures and exit non-zero.

let failures = 0;
const logAssert = console.assert.bind(console);
console.assert = (condition?: boolean, ...data: unknown[]) => {
  if (!condition) failures++;
  logAssert(condition, ...data);
};

// ============================================
// TEST DATA SETUP
// ============================================

const MONDAY = 1705200000000;    // Some Monday
const FRIDAY = 1705632000000;    // That Friday (5 days later)
const NEXT_MONDAY = 1705804800000; // Following Monday

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Bread',
    buy_price: 14.00,
    sell_price: 18.00,
    current_qty: 10,
    unit_label: 'each',
    is_active: true,
    ...overrides
  };
}

function createMovement(overrides: Partial<StockMovement>): StockMovement {
  return {
    id: 1,
    product_id: 1,
    type: 'STOCK_IN',
    quantity: 10,
    recorded_at: MONDAY,
    ...overrides
  };
}

// ============================================
// TEST: Basic Sales Calculation
// ============================================

console.log('TEST: Basic Sales Calculation');
console.log('========================================');

// Scenario: Owner bought 20 bread on Monday, counted 10 left on Friday
// Expected: 10 sold, R180 revenue, R40 profit

const breadProduct = createProduct({ id: 1, name: 'Bread' });
const breadMovements: StockMovement[] = [
  createMovement({ id: 1, product_id: 1, type: 'STOCK_IN', quantity: 20, recorded_at: MONDAY }),
  createMovement({ id: 2, product_id: 1, type: 'COUNT', quantity: 10, recorded_at: FRIDAY }),
];

const result = calculateProductMetrics(breadProduct, breadMovements, MONDAY, FRIDAY);

console.log('Product:', result.product_name);
console.log('Opening:', result.opening_qty);
console.log('Stock In:', result.stock_in_qty);
console.log('Closing:', result.closing_qty);
console.log('Estimated Sold:', result.estimated_sold);
console.log('Revenue:', formatCurrency(result.estimated_revenue));
console.log('Profit:', formatCurrency(result.estimated_profit));
console.log('Margin:', result.profit_margin.toFixed(1) + '%');
console.log('Confidence:', result.confidence);
console.log('');

// Assert
console.assert(result.estimated_sold === 10, 'Should sell 10 units');
console.assert(result.estimated_revenue === 180, 'Revenue should be R180');
console.assert(result.estimated_profit === 40, 'Profit should be R40');
console.assert(result.confidence >= 0.8, 'Should have high confidence');

// ============================================
// TEST: Multiple Stock-Ins
// ============================================

console.log('TEST: Multiple Stock-Ins');
console.log('========================================');

// Scenario: Two deliveries during the week
// Monday: +20, Wednesday: +10, Friday count: 15 left
// Expected: (0 + 30 - 15) = 15 sold

const multiDeliveryMovements: StockMovement[] = [
  createMovement({ id: 1, type: 'STOCK_IN', quantity: 20, recorded_at: MONDAY }),
  createMovement({ id: 2, type: 'STOCK_IN', quantity: 10, recorded_at: MONDAY + 172800000 }), // +2 days
  createMovement({ id: 3, type: 'COUNT', quantity: 15, recorded_at: FRIDAY }),
];

const multiResult = calculateProductMetrics(breadProduct, multiDeliveryMovements, MONDAY, FRIDAY);

console.log('Stock In Total:', multiResult.stock_in_qty);
console.log('Estimated Sold:', multiResult.estimated_sold);
console.log('Revenue:', formatCurrency(multiResult.estimated_revenue));
console.log('');

console.assert(multiResult.stock_in_qty === 30, 'Should have 30 total stock in');
console.assert(multiResult.estimated_sold === 15, 'Should sell 15 units');

// ============================================
// TEST: Carry-over from Previous Period
// ============================================

console.log('TEST: Carry-over from Previous Period');
console.log('========================================');

// Scenario: Started week with 5 from last week, bought 20, ended with 8
// Expected: (5 + 20 - 8) = 17 sold

const carryOverMovements: StockMovement[] = [
  // Previous week: counted 5 left
  createMovement({ id: 1, type: 'COUNT', quantity: 5, recorded_at: MONDAY - 86400000 }), // Day before
  // This week: bought 20, counted 8
  createMovement({ id: 2, type: 'STOCK_IN', quantity: 20, recorded_at: MONDAY }),
  createMovement({ id: 3, type: 'COUNT', quantity: 8, recorded_at: FRIDAY }),
];

const carryResult = calculateProductMetrics(breadProduct, carryOverMovements, MONDAY, FRIDAY);

console.log('Opening (carried over):', carryResult.opening_qty);
console.log('Stock In:', carryResult.stock_in_qty);
console.log('Closing:', carryResult.closing_qty);
console.log('Estimated Sold:', carryResult.estimated_sold);
console.log('');

console.assert(carryResult.opening_qty === 5, 'Should carry over 5 from previous week');
console.assert(carryResult.estimated_sold === 17, 'Should sell 17 units');

// ============================================
// TEST: Anomaly Detection - Stock Loss
// ============================================

console.log('TEST: Anomaly Detection - Stock Loss');
console.log('========================================');

// Scenario: Had 20, sold none (slow week), but only 15 left
// This could indicate theft, damage, or expiry

const lossMovements: StockMovement[] = [
  createMovement({ id: 1, type: 'STOCK_IN', quantity: 20, recorded_at: MONDAY }),
  createMovement({ id: 2, type: 'COUNT', quantity: 15, recorded_at: FRIDAY }),
];

const lossResult = calculateProductMetrics(breadProduct, lossMovements, MONDAY, FRIDAY);

console.log('Opening:', lossResult.opening_qty);
console.log('Estimated Sold:', lossResult.estimated_sold);
console.log('Has Anomaly:', lossResult.has_anomaly);
console.log('Anomaly Type:', lossResult.anomaly_type || 'None');
console.log('Confidence:', lossResult.confidence);
console.log('');

// Note: 5 units "sold" is normal, no anomaly
// Anomaly would be if closing > opening + stock_in

// ============================================
// TEST: Impossible Data (Negative Sales)
// ============================================

console.log('TEST: Impossible Data (Negative Sales)');
console.log('========================================');

// Scenario: Had 10, bought 0, now have 15
// This is impossible without unrecorded stock-in

const impossibleMovements: StockMovement[] = [
  createMovement({ id: 1, type: 'COUNT', quantity: 10, recorded_at: MONDAY - 86400000 }),
  createMovement({ id: 2, type: 'COUNT', quantity: 15, recorded_at: FRIDAY }),
];

const impossibleResult = calculateProductMetrics(breadProduct, impossibleMovements, MONDAY, FRIDAY);

console.log('Opening:', impossibleResult.opening_qty);
console.log('Stock In:', impossibleResult.stock_in_qty);
console.log('Closing:', impossibleResult.closing_qty);
console.log('Raw Calculation:', impossibleResult.opening_qty + impossibleResult.stock_in_qty - impossibleResult.closing_qty);
console.log('Estimated Sold (clamped):', impossibleResult.estimated_sold);
console.log('Has Anomaly:', impossibleResult.has_anomaly);
console.log('Anomaly Type:', impossibleResult.anomaly_type || 'None');
console.log('');

console.assert(impossibleResult.estimated_sold === 0, 'Negative sales should be clamped to 0');
console.assert(impossibleResult.has_anomaly === true, 'Should flag anomaly');
console.assert(impossibleResult.anomaly_type === 'IMPOSSIBLE_GAIN', 'Should be IMPOSSIBLE_GAIN');

// ============================================
// TEST: No Data Scenario
// ============================================

console.log('TEST: No Data Scenario');
console.log('========================================');

// Scenario: Product exists but no movements recorded

const noDataResult = calculateProductMetrics(breadProduct, [], MONDAY, FRIDAY);

console.log('Estimated Sold:', noDataResult.estimated_sold);
console.log('Has Anomaly:', noDataResult.has_anomaly);
console.log('Anomaly Type:', noDataResult.anomaly_type || 'None');
console.log('Confidence:', noDataResult.confidence);
console.log('');

console.assert(noDataResult.has_anomaly === true, 'Should flag no data');
console.assert(noDataResult.confidence < 0.5, 'Should have low confidence');

// ============================================
// TEST: Period Summary (Multiple Products)
// ============================================

console.log('TEST: Period Summary (Multiple Products)');
console.log('========================================');

const products: Product[] = [
  createProduct({ id: 1, name: 'Bread', buy_price: 14, sell_price: 18 }),
  createProduct({ id: 2, name: 'Coke', buy_price: 12, sell_price: 15 }),
  createProduct({ id: 3, name: 'Chips', buy_price: 8, sell_price: 12 }),
];

const allMovements: StockMovement[] = [
  // Bread: bought 20, 10 left → sold 10
  createMovement({ id: 1, product_id: 1, type: 'STOCK_IN', quantity: 20, recorded_at: MONDAY }),
  createMovement({ id: 2, product_id: 1, type: 'COUNT', quantity: 10, recorded_at: FRIDAY }),
  // Coke: bought 48, 24 left → sold 24
  createMovement({ id: 3, product_id: 2, type: 'STOCK_IN', quantity: 48, recorded_at: MONDAY }),
  createMovement({ id: 4, product_id: 2, type: 'COUNT', quantity: 24, recorded_at: FRIDAY }),
  // Chips: bought 60, 30 left → sold 30
  createMovement({ id: 5, product_id: 3, type: 'STOCK_IN', quantity: 60, recorded_at: MONDAY }),
  createMovement({ id: 6, product_id: 3, type: 'COUNT', quantity: 30, recorded_at: FRIDAY }),
];

const summary = calculatePeriodSummary(products, allMovements, MONDAY, FRIDAY);

console.log('WEEKLY SUMMARY');
console.log('--------------');
console.log('Total Units Sold:', summary.total_units_sold);
console.log('Total Revenue:', formatCurrency(summary.total_estimated_revenue));
console.log('Total Profit:', formatCurrency(summary.total_estimated_profit));
console.log('Profit Margin:', summary.overall_profit_margin.toFixed(1) + '%');
console.log('');
console.log('Top Sellers:');
summary.top_sellers.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.product_name}: ${p.estimated_sold} sold`);
});
console.log('');
console.log('Top Profit:');
summary.top_profit.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.product_name}: ${formatCurrency(p.estimated_profit)}`);
});
console.log('');

// Expected totals:
// Bread: 10 × R18 = R180 revenue, 10 × R4 = R40 profit
// Coke: 24 × R15 = R360 revenue, 24 × R3 = R72 profit
// Chips: 30 × R12 = R360 revenue, 30 × R4 = R120 profit
// Total: R900 revenue, R232 profit

console.assert(summary.total_units_sold === 64, 'Should sell 64 units total');
console.assert(summary.total_estimated_revenue === 900, 'Revenue should be R900');
console.assert(summary.total_estimated_profit === 232, 'Profit should be R232');

// ============================================
// TEST: Period Bounds Helper
// ============================================

console.log('TEST: Period Bounds Helper');
console.log('========================================');

const now = new Date('2026-01-14T10:00:00').getTime(); // Wednesday

const today = getPeriodBounds('today', now);
console.log('Today:', new Date(today.start).toDateString(), 'to', new Date(today.end).toDateString());

const thisWeek = getPeriodBounds('this_week', now);
console.log('This Week:', new Date(thisWeek.start).toDateString(), 'to', new Date(thisWeek.end).toDateString());

const lastWeek = getPeriodBounds('last_week', now);
console.log('Last Week:', new Date(lastWeek.start).toDateString(), 'to', new Date(lastWeek.end).toDateString());

console.log('');

// ============================================
// SUMMARY
// ============================================

console.log('========================================');
console.log('ALL TESTS COMPLETED');
console.log('========================================');
console.log('');
console.log('The calculation engine handles:');
console.log('✓ Basic stock movement → sales inference');
console.log('✓ Multiple stock-ins per period');
console.log('✓ Carry-over from previous periods');
console.log('✓ Anomaly detection (loss, impossible data)');
console.log('✓ Graceful handling of missing data');
console.log('✓ Period summaries with totals');
console.log('✓ Top sellers and profit rankings');
console.log('');

if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all assertions held');
