/**
 * STOCK-IN FLOW DOCUMENTATION
 * ============================
 * 
 * This documents the Stock-In feature and how it integrates
 * with the rest of ShopTrack.
 * 
 * ============================================
 * WHY STOCK-IN EXISTS
 * ============================================
 * 
 * The core profit formula is:
 * 
 *   estimated_sold = opening_qty + stock_in_qty - closing_qty
 * 
 * Without stock-in tracking:
 * - We assume stock_in_qty = 0
 * - This means restocking looks like NEGATIVE sales
 * - Creates confusing anomalies
 * 
 * With stock-in tracking:
 * - We know actual stock_in_qty
 * - Profit calculations are more accurate
 * - Anomalies are real anomalies (not just restocks)
 * 
 * ============================================
 * CRITICAL DESIGN RULE: OPTIONAL
 * ============================================
 * 
 * Stock-in is OPTIONAL. The app must work without it.
 * 
 * Why?
 * - Some owners won't remember to log purchases
 * - Some will only log big purchases
 * - Forcing it would kill adoption
 * 
 * The app handles missing stock-in gracefully:
 * - Falls back to stock_in_qty = 0
 * - Still shows profit (just less accurate)
 * - No error messages or warnings
 * 
 * ============================================
 * USER FLOW
 * ============================================
 * 
 * Entry point: Home screen "Add Stock" button (or from product list)
 * 
 * STEP 1: Select Product
 * ┌─────────────────────────────────────┐
 * │ [✕]       Add Stock                 │
 * │                                     │
 * │ What did you buy?                   │
 * │                                     │
 * │ ┌─────────────────────────────────┐ │
 * │ │ 🔍 Search products...           │ │
 * │ └─────────────────────────────────┘ │
 * │                                     │
 * │ ┌─────────────────────────────────┐ │
 * │ │ Coca-Cola 500ml                 │ │
 * │ │ 24 units in stock               │ │
 * │ ├─────────────────────────────────┤ │
 * │ │ Bread (Albany)                  │ │
 * │ │ 8 units in stock                │ │
 * │ ├─────────────────────────────────┤ │
 * │ │ Simba Chips                     │ │
 * │ │ 36 units in stock               │ │
 * │ └─────────────────────────────────┘ │
 * └─────────────────────────────────────┘
 * 
 * STEP 2: Enter Details
 * ┌─────────────────────────────────────┐
 * │ [←]       Add Stock                 │
 * │                                     │
 * │ ┌─────────────────────────────────┐ │
 * │ │ Coca-Cola 500ml                 │ │
 * │ │ Currently: 24 units             │ │
 * │ └─────────────────────────────────┘ │
 * │                                     │
 * │ How many did you buy?               │
 * │                                     │
 * │      [ 48 ] units                   │
 * │                                     │
 * │ How much did it cost?               │
 * │                                     │
 * │ ┌──────────────┬──────────────────┐ │
 * │ │ Total Cost   │   Per Item       │ │
 * │ └──────────────┴──────────────────┘ │
 * │                                     │
 * │      R[ 8.50 ] each                 │
 * │                                     │
 * │ ┌─────────────────────────────────┐ │
 * │ │ 48 units × R8.50 = R408.00      │ │
 * │ └─────────────────────────────────┘ │
 * │                                     │
 * │ ┌─────────────────────────────────┐ │
 * │ │         Save Stock-In           │ │
 * │ └─────────────────────────────────┘ │
 * └─────────────────────────────────────┘
 * 
 * SUCCESS:
 * ┌─────────────────────────────────────┐
 * │                                     │
 * │        Stock Added! ✓               │
 * │                                     │
 * │   48 units of Coca-Cola 500ml       │
 * │           recorded.                 │
 * │                                     │
 * │           [ Done ]                  │
 * │                                     │
 * └─────────────────────────────────────┘
 * 
 * ============================================
 * DATA FLOW
 * ============================================
 * 
 * User action:
 *   "I bought 48 Cokes for R408"
 *         │
 *         ▼
 * StockInScreen.handleSave()
 *         │
 *         ▼
 * src/core/db.ts recordStockIn()
 *         │
 *         ├── INSERT into stock_movements (type='STOCK_IN')
 *         │
 *         ├── UPDATE products.current_qty += 48
 *         │
 *         └── INSERT/UPDATE product_price_history
 *         
 *         ▼
 * Next stock count uses updated current_qty
 *         │
 *         ▼
 * Calculation engine uses stock_in movements
 *         │
 *         ▼
 * More accurate profit numbers! ✓
 * 
 * ============================================
 * DATABASE IMPACT
 * ============================================
 * 
 * Tables affected:
 * 
 * 1. stock_movements (new row)
 *    - type = 'STOCK_IN'
 *    - quantity = 48
 *    - buy_price_at_time = 8.50
 *    - total_cost = 408.00
 *    - recorded_at = unix ms
 *
 * 2. products (updated)
 *    - current_qty += 48
 *    - buy_price = 8.50 (latest price)
 *
 * NOTE: an earlier draft proposed a product_price_history table. It was never
 * built and is not needed -- buy_price_at_time on each STOCK_IN row already
 * preserves the price paid at the time, which is what history was for.
 *
 * ============================================
 * EDGE CASES HANDLED
 * ============================================
 * 
 * 1. No products yet
 *    → Show "No products yet" message
 *    → User must add products first
 * 
 * 2. Product has existing buy_price
 *    → Pre-fill cost input with last price
 *    → Default to "Per Item" mode
 * 
 * 3. User enters total cost vs per-item cost
 *    → Toggle between modes
 *    → Calculate the other value automatically
 * 
 * 4. Mistake / wrong entry
 *    → Can undo within 24 hours
 *    → After 24 hours, just do a count to correct
 * 
 * ============================================
 * WHAT THIS IS NOT
 * ============================================
 * 
 * This is NOT:
 * ❌ Invoice management
 * ❌ Supplier tracking
 * ❌ Receipt scanning
 * ❌ VAT calculation
 * ❌ Purchase orders
 * ❌ Inventory receiving
 * 
 * This IS:
 * ✅ Quick stock-in logging
 * ✅ Cost tracking for profit accuracy
 * ✅ Optional enhancement
 * ✅ One-screen flow
 * 
 * ============================================
 * SUCCESS METRICS
 * ============================================
 * 
 * Good signals:
 * - Users log stock-in at least once per week
 * - Users log big purchases (cases, bulk)
 * - Profit numbers become more stable
 * 
 * Warning signals:
 * - Users log every single purchase (too tedious)
 * - Users feel guilty for not logging
 * - Stock-in creates more confusion
 * 
 * Goal:
 * "I log stock when I remember, and my profit numbers 
 *  are still useful even when I forget"
 */

export {};
