/**
 * ============================================
 * SHOPTRACK CORE CALCULATION ENGINE
 * ============================================
 * 
 * The "truth machine" for informal shops.
 * 
 * Core insight: Sales = Previous Stock + Stock In - Current Stock
 * 
 * This module is:
 * - Pure functions (no side effects)
 * - Offline-first (no network calls)
 * - Deterministic (same input = same output)
 * - AI-ready (outputs confidence scores)
 */

// ============================================
// TYPES
// ============================================

export interface Product {
  id: number;
  name: string;
  buy_price: number;   // Cost price (what owner pays)
  sell_price: number;  // Retail price (what customer pays)
  current_qty: number;
  unit_label: string;  // Display only: 'each', 'bottle', 'pack' (no math)
  is_active: boolean;
}

export interface StockMovement {
  id: number;
  product_id: number;
  type: 'STOCK_IN' | 'COUNT';
  quantity: number;
  buy_price_at_time?: number;   // Price snapshot for STOCK_IN
  sell_price_at_time?: number;  // Price snapshot for COUNT
  notes?: string;
  recorded_at: number; // Unix timestamp (ms)
}

export interface ProductMetrics {
  product_id: number;
  product_name: string;
  
  // Stock movement
  opening_qty: number;      // What we started with
  stock_in_qty: number;     // What was added
  closing_qty: number;      // What's left (from COUNT)
  
  // Calculated values
  estimated_sold: number;   // opening + stock_in - closing
  estimated_revenue: number;
  estimated_profit: number;
  profit_margin: number;    // As percentage (0-100)
  
  // Historical prices used (for audit trail)
  buy_price_used: number;
  sell_price_used: number;
  
  // Data quality
  confidence: number;       // 0.0 to 1.0
  has_anomaly: boolean;
  anomaly_type?: 'LOSS' | 'NEGATIVE_SALES' | 'IMPOSSIBLE_GAIN' | 'NO_DATA';
  
  // Human-readable explanation
  truth_statement: string;  // "You likely sold 12 units of Sugar this week"
}

export interface PeriodSummary {
  period_start: number;
  period_end: number;
  
  // Totals
  total_stock_in_cost: number;
  total_estimated_revenue: number;
  total_estimated_profit: number;
  total_units_sold: number;
  overall_profit_margin: number;
  
  // Breakdown
  products: ProductMetrics[];
  top_sellers: ProductMetrics[];
  top_profit: ProductMetrics[];
  anomalies: ProductMetrics[];
  
  // Quality
  products_with_data: number;
  products_with_anomalies: number;
  overall_confidence: number;
}

// ============================================
// CORE CALCULATION: Single Product
// ============================================

/**
 * Calculate metrics for a single product over a period.
 * 
 * The formula: estimated_sold = opening + stock_in - closing
 * 
 * This handles imperfect data gracefully.
 */
export function calculateProductMetrics(
  product: Product,
  movements: StockMovement[],
  period_start: number,
  period_end: number
): ProductMetrics {
  
  // Filter movements for this period
  const periodMovements = movements.filter(m => 
    m.product_id === product.id &&
    m.recorded_at >= period_start &&
    m.recorded_at <= period_end
  );
  
  // Get movements before this period (to find opening quantity)
  const priorMovements = movements.filter(m =>
    m.product_id === product.id &&
    m.recorded_at < period_start
  );
  
  // Calculate opening quantity
  // Use the last COUNT before period start, or sum of STOCK_INs
  const opening_qty = calculateOpeningQuantity(priorMovements, product);
  
  // Sum all STOCK_IN during period
  const stock_in_qty = periodMovements
    .filter(m => m.type === 'STOCK_IN')
    .reduce((sum, m) => sum + m.quantity, 0);
  
  // Get closing quantity (last COUNT in period, or current_qty)
  const closing_qty = getClosingQuantity(periodMovements, product);
  
  // THE CORE CALCULATION
  const estimated_sold = opening_qty + stock_in_qty - closing_qty;
  
  // Get historical prices (prefer snapshots, fallback to current)
  const { buy_price_used, sell_price_used } = getHistoricalPrices(
    product,
    periodMovements,
    priorMovements
  );
  
  // Negative sales mean an unrecorded delivery or a first baseline, never a
  // real loss. Clamp before every money calculation so a first count cannot
  // surface as negative profit on Home.
  const sold_for_money = Math.max(0, estimated_sold);
  const estimated_revenue = sold_for_money * sell_price_used;
  const estimated_cost = sold_for_money * buy_price_used;
  const estimated_profit = estimated_revenue - estimated_cost;
  const profit_margin = estimated_revenue > 0 
    ? (estimated_profit / estimated_revenue) * 100 
    : 0;
  
  // Detect anomalies and calculate confidence
  const { has_anomaly, anomaly_type, confidence } = detectAnomalies(
    estimated_sold,
    opening_qty,
    stock_in_qty,
    closing_qty,
    periodMovements
  );
  
  // Generate truth statement
  const truth_statement = generateTruthStatement(
    product.name,
    Math.max(0, estimated_sold),
    estimated_profit,
    confidence,
    has_anomaly,
    anomaly_type
  );
  
  return {
    product_id: product.id,
    product_name: product.name,
    opening_qty,
    stock_in_qty,
    closing_qty,
    estimated_sold: sold_for_money, // Never show negative sales
    estimated_revenue,
    estimated_profit,
    profit_margin,
    buy_price_used,
    sell_price_used,
    confidence,
    has_anomaly,
    anomaly_type,
    truth_statement
  };
}

// ============================================
// HELPER: Opening Quantity
// ============================================

/**
 * Determine what quantity we started the period with.
 * 
 * Priority:
 * 1. Last COUNT before period
 * 2. Sum of all prior STOCK_INs minus estimated prior sales
 * 3. Default to 0 with low confidence
 */
function calculateOpeningQuantity(
  priorMovements: StockMovement[],
  product: Product
): number {
  // Find the last COUNT before period
  const priorCounts = priorMovements
    .filter(m => m.type === 'COUNT')
    .sort((a, b) => b.recorded_at - a.recorded_at);
  
  if (priorCounts.length > 0) {
    const lastCount = priorCounts[0];
    
    // Add any STOCK_IN after that count
    const stockInAfterCount = priorMovements
      .filter(m => m.type === 'STOCK_IN' && m.recorded_at > lastCount.recorded_at)
      .reduce((sum, m) => sum + m.quantity, 0);
    
    return lastCount.quantity + stockInAfterCount;
  }
  
  // No prior counts - sum all prior STOCK_INs
  // This is less accurate but better than nothing
  const totalStockIn = priorMovements
    .filter(m => m.type === 'STOCK_IN')
    .reduce((sum, m) => sum + m.quantity, 0);
  
  return totalStockIn;
}

// ============================================
// HELPER: Closing Quantity
// ============================================

/**
 * Determine what quantity we ended the period with.
 * Uses the last COUNT in the period, or product's current_qty.
 */
function getClosingQuantity(
  periodMovements: StockMovement[],
  product: Product
): number {
  const counts = periodMovements
    .filter(m => m.type === 'COUNT')
    .sort((a, b) => b.recorded_at - a.recorded_at);
  
  if (counts.length > 0) {
    return counts[0].quantity;
  }
  
  // No count this period - use current quantity (less reliable)
  return product.current_qty;
}

// ============================================
// HELPER: Historical Prices
// ============================================

/**
 * Get the prices to use for calculations.
 * Priority: price snapshots from movements > current product prices
 */
function getHistoricalPrices(
  product: Product,
  periodMovements: StockMovement[],
  priorMovements: StockMovement[]
): { buy_price_used: number; sell_price_used: number } {
  
  // For buy price: use most recent STOCK_IN with price snapshot
  const stockIns = [...priorMovements, ...periodMovements]
    .filter(m => m.type === 'STOCK_IN' && m.buy_price_at_time != null)
    .sort((a, b) => b.recorded_at - a.recorded_at);
  
  const buy_price_used = stockIns.length > 0 
    ? stockIns[0].buy_price_at_time! 
    : product.buy_price;
  
  // For sell price: use most recent COUNT with price snapshot
  const counts = [...priorMovements, ...periodMovements]
    .filter(m => m.type === 'COUNT' && m.sell_price_at_time != null)
    .sort((a, b) => b.recorded_at - a.recorded_at);
  
  const sell_price_used = counts.length > 0 
    ? counts[0].sell_price_at_time! 
    : product.sell_price;
  
  return { buy_price_used, sell_price_used };
}

// ============================================
// ANOMALY DETECTION
// ============================================

interface AnomalyResult {
  has_anomaly: boolean;
  anomaly_type?: 'LOSS' | 'NEGATIVE_SALES' | 'IMPOSSIBLE_GAIN' | 'NO_DATA';
  confidence: number;
}

/**
 * Detect data anomalies that might indicate:
 * - Stock loss (theft, damage, expiry)
 * - Data entry errors
 * - Missing stock-in records
 * 
 * Returns confidence score: 1.0 = very confident, 0.0 = unreliable
 */
function detectAnomalies(
  estimated_sold: number,
  opening_qty: number,
  stock_in_qty: number,
  closing_qty: number,
  movements: StockMovement[]
): AnomalyResult {
  
  // No data at all
  if (movements.length === 0 && opening_qty === 0) {
    return {
      has_anomaly: true,
      anomaly_type: 'NO_DATA',
      confidence: 0.1
    };
  }
  
  // Negative sales (closing > opening + stock_in)
  // This means more stock appeared than we recorded
  if (estimated_sold < 0) {
    return {
      has_anomaly: true,
      anomaly_type: 'IMPOSSIBLE_GAIN',
      confidence: 0.3
    };
  }
  
  // Suspiciously high sales (sold more than 100% of available stock)
  // Could indicate theft, damage, or missed stock-in
  const available = opening_qty + stock_in_qty;
  if (available > 0 && estimated_sold > available) {
    return {
      has_anomaly: true,
      anomaly_type: 'LOSS',
      confidence: 0.5
    };
  }
  
  // Check if we have good data (at least one COUNT)
  const hasCount = movements.some(m => m.type === 'COUNT');
  
  // Good data: high confidence
  if (hasCount && opening_qty >= 0) {
    return {
      has_anomaly: false,
      confidence: 0.9
    };
  }
  
  // No count this period but have opening data
  if (!hasCount && opening_qty > 0) {
    return {
      has_anomaly: false,
      confidence: 0.6
    };
  }
  
  // Default: moderate confidence
  return {
    has_anomaly: false,
    confidence: 0.7
  };
}

// ============================================
// TRUTH STATEMENT GENERATOR
// ============================================

/**
 * Generate a human-readable explanation of what happened.
 * This builds trust by being transparent about calculations.
 */
function generateTruthStatement(
  productName: string,
  estimatedSold: number,
  estimatedProfit: number,
  confidence: number,
  hasAnomaly: boolean,
  anomalyType?: string
): string {
  
  // Handle anomalies first
  if (hasAnomaly) {
    switch (anomalyType) {
      case 'NO_DATA':
        return `Not enough data to estimate ${productName} sales.`;
      case 'IMPOSSIBLE_GAIN':
        return `${productName} shows more stock than recorded. Check if you missed a delivery.`;
      case 'LOSS':
        return `${productName} may have loss or damage. Stock is lower than expected.`;
      case 'NEGATIVE_SALES':
        return `${productName} data looks incorrect. Please recount.`;
    }
  }
  
  // No sales
  if (estimatedSold === 0) {
    return `No ${productName} sold this period.`;
  }
  
  // Build confidence qualifier
  let qualifier = '';
  if (confidence < 0.5) {
    qualifier = 'roughly ';
  } else if (confidence < 0.8) {
    qualifier = 'about ';
  }
  
  // Build profit statement
  const profitStatement = estimatedProfit >= 0
    ? `making ${qualifier}R${Math.abs(estimatedProfit).toFixed(0)} profit`
    : `losing R${Math.abs(estimatedProfit).toFixed(0)}`;
  
  return `You ${qualifier}sold ${estimatedSold} ${productName}, ${profitStatement}.`;
}

// ============================================
// PERIOD SUMMARY CALCULATION
// ============================================

/**
 * Calculate summary metrics for all products over a period.
 * This is what powers the dashboard.
 */
export function calculatePeriodSummary(
  products: Product[],
  movements: StockMovement[],
  period_start: number,
  period_end: number
): PeriodSummary {
  
  // Calculate metrics for each active product
  const productMetrics = products
    .filter(p => p.is_active)
    .map(p => calculateProductMetrics(p, movements, period_start, period_end));
  
  // Aggregate totals
  const total_stock_in_cost = movements
    .filter(m => 
      m.type === 'STOCK_IN' &&
      m.recorded_at >= period_start &&
      m.recorded_at <= period_end
    )
    .reduce((sum, m) => {
      const product = products.find(p => p.id === m.product_id);
      const unit_cost = m.buy_price_at_time ?? product?.buy_price ?? 0;
      return sum + (m.quantity * unit_cost);
    }, 0);
  
  const total_estimated_revenue = productMetrics
    .reduce((sum, m) => sum + m.estimated_revenue, 0);
  
  const total_estimated_profit = productMetrics
    .reduce((sum, m) => sum + m.estimated_profit, 0);
  
  const total_units_sold = productMetrics
    .reduce((sum, m) => sum + m.estimated_sold, 0);
  
  const overall_profit_margin = total_estimated_revenue > 0
    ? (total_estimated_profit / total_estimated_revenue) * 100
    : 0;
  
  // Sort for top lists
  const top_sellers = [...productMetrics]
    .sort((a, b) => b.estimated_sold - a.estimated_sold)
    .slice(0, 5);
  
  const top_profit = [...productMetrics]
    .sort((a, b) => b.estimated_profit - a.estimated_profit)
    .slice(0, 5);
  
  // Find anomalies
  const anomalies = productMetrics.filter(m => m.has_anomaly);
  
  // Calculate overall confidence (weighted by revenue)
  const overall_confidence = productMetrics.length > 0
    ? productMetrics.reduce((sum, m) => {
        const weight = m.estimated_revenue / Math.max(total_estimated_revenue, 1);
        return sum + (m.confidence * weight);
      }, 0)
    : 0;
  
  return {
    period_start,
    period_end,
    total_stock_in_cost,
    total_estimated_revenue,
    total_estimated_profit,
    total_units_sold,
    overall_profit_margin,
    products: productMetrics,
    top_sellers,
    top_profit,
    anomalies,
    products_with_data: productMetrics.filter(m => m.confidence > 0.5).length,
    products_with_anomalies: anomalies.length,
    overall_confidence
  };
}

// ============================================
// UTILITY: Period Helpers
// ============================================

/**
 * Get start and end timestamps for common periods.
 * Uses simple date math, no external dependencies.
 */
export function getPeriodBounds(
  period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month',
  now: number = Date.now()
): { start: number; end: number } {
  
  const date = new Date(now);
  
  switch (period) {
    case 'today': {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const end = start + (24 * 60 * 60 * 1000) - 1;
      return { start, end };
    }
    
    case 'yesterday': {
      const today = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const start = today - (24 * 60 * 60 * 1000);
      const end = today - 1;
      return { start, end };
    }
    
    case 'this_week': {
      // Week starts Monday (ISO)
      const dayOfWeek = date.getDay() || 7; // Sunday = 7
      const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek + 1);
      const start = monday.getTime();
      const end = start + (7 * 24 * 60 * 60 * 1000) - 1;
      return { start, end };
    }
    
    case 'last_week': {
      const dayOfWeek = date.getDay() || 7;
      const thisMonday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek + 1);
      const lastMonday = new Date(thisMonday.getTime() - (7 * 24 * 60 * 60 * 1000));
      const start = lastMonday.getTime();
      const end = thisMonday.getTime() - 1;
      return { start, end };
    }
    
    case 'this_month': {
      const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      return { start, end };
    }
  }
}

// ============================================
// FORMATTING HELPERS
// ============================================

/**
 * Format currency for display (South African Rand).
 * Simple, no external dependencies.
 */
export function formatCurrency(amount: number, currency: string = 'R'): string {
  const rounded = Math.round(amount * 100) / 100;
  const formatted = rounded.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${currency}${formatted}`;
}

/**
 * Format percentage for display.
 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Get human-readable confidence label.
 */
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'Good data';
  if (confidence >= 0.5) return 'Some missing data';
  if (confidence >= 0.3) return 'Limited data';
  return 'Not enough data';
}
