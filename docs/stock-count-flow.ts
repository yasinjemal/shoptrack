/**
 * ============================================
 * STOCK COUNT FLOW - DATA FLOW DIAGRAM
 * ============================================
 * 
 * This documents how data moves through the Stock Count feature.
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        USER ACTIONS                             │
 * └─────────────────────────────────────────────────────────────────┘
 *                                │
 *                                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    1. OPEN COUNT SCREEN                         │
 * │                                                                 │
 * │  User taps "Count Stock" button on home screen                  │
 * │                                                                 │
 * │  Triggers: loadProducts(db)                                     │
 * │  └─> SELECT active products through src/core/db.ts               │
 * │                                                                 │
 * │  Returns: Product[] (all active products)                       │
 * └─────────────────────────────────────────────────────────────────┘
 *                                │
 *                                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    2. COUNT SCREEN (UI)                         │
 * │                                                                 │
 * │  ┌──────────────────────────────────────┐                       │
 * │  │ Count Your Stock                     │                       │
 * │  │ Tap a product and enter how many     │                       │
 * │  ├──────────────────────────────────────┤                       │
 * │  │ [====------] 3 of 10 counted         │                       │
 * │  ├──────────────────────────────────────┤                       │
 * │  │ Bread          Was: 10    [Tap]      │                       │
 * │  │ Coke 500ml     Was: 24    [12] ✓     │                       │
 * │  │ Simba Chips    Was: 30    [−][15][+] │ ← Active row          │
 * │  │ Airtime R10    Was: 50    [Tap]      │                       │
 * │  ├──────────────────────────────────────┤                       │
 * │  │     [ Review 3 Counted ]             │                       │
 * │  └──────────────────────────────────────┘                       │
 * │                                                                 │
 * │  Local state: CountEntry[] { product_id, counted_qty, prev }    │
 * │  NO database writes yet - pure UI state                         │
 * └─────────────────────────────────────────────────────────────────┘
 *                                │
 *                                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    3. REVIEW SCREEN (UI)                        │
 * │                                                                 │
 * │  ┌──────────────────────────────────────┐                       │
 * │  │ Review Your Count                    │                       │
 * │  │ 3 products counted                   │                       │
 * │  ├──────────────────────────────────────┤                       │
 * │  │ Coke 500ml                           │                       │
 * │  │ Was: 24 → Now: 12  (-12)             │                       │
 * │  │                                      │                       │
 * │  │ Simba Chips                          │                       │
 * │  │ Was: 30 → Now: 15  (-15)             │                       │
 * │  ├──────────────────────────────────────┤                       │
 * │  │  [Go Back]    [ Save Count ]         │                       │
 * │  └──────────────────────────────────────┘                       │
 * │                                                                 │
 * │  Still no database writes - user can go back and edit           │
 * └─────────────────────────────────────────────────────────────────┘
 *                                │
 *                                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    4. SAVE COUNT (DATABASE)                     │
 * │                                                                 │
 * │  User taps "Save Count"                                         │
 * │                                                                 │
 * │  Triggers: saveCountSession(db, entries, totalProducts)         │
 * │                                                                 │
 * │  Transaction:                                                   │
 * │  ┌─────────────────────────────────────────────────────────┐    │
 * │  │ 1. INSERT INTO count_sessions (...)                     │    │
 * │  │                                                         │    │
 * │  │ 2. FOR EACH counted product:                            │    │
 * │  │    INSERT INTO stock_movements (                        │    │
 * │  │      product_id, type='COUNT', quantity,                │    │
 * │  │      sell_price_at_time, recorded_at                    │    │
 * │  │    )                                                    │    │
 * │  │                                                         │    │
 * │  │ 3. FOR EACH counted product:                            │    │
 * │  │    UPDATE products SET current_qty = ? WHERE id = ?     │    │
 * │  │                                                         │    │
 * │  │ 4. Calculate metrics using calculation engine           │    │
 * │  └─────────────────────────────────────────────────────────┘    │
 * │                                                                 │
 * │  Returns: { sessionId, metrics: ProductMetrics[] }              │
 * └─────────────────────────────────────────────────────────────────┘
 *                                │
 *                                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    5. RESULTS SCREEN (UI)                       │
 * │                                                                 │
 * │  ┌──────────────────────────────────────┐                       │
 * │  │            ✓                         │                       │
 * │  │       Count Saved!                   │                       │
 * │  │                                      │                       │
 * │  │  ┌────────┬────────┬────────┐        │                       │
 * │  │  │   27   │  R471  │  R103  │        │                       │
 * │  │  │ Items  │ Sales  │ Profit │ ← Highlighted                  │
 * │  │  │ Sold   │        │        │        │                       │
 * │  │  └────────┴────────┴────────┘        │                       │
 * │  │                                      │                       │
 * │  │  "You sold 12 Coke, making R36       │                       │
 * │  │   profit."                           │ ← Truth statement     │
 * │  │                                      │                       │
 * │  │  Based on 3 products counted.        │                       │
 * │  │                                      │                       │
 * │  │         [ Done ]                     │                       │
 * │  └──────────────────────────────────────┘                       │
 * │                                                                 │
 * │  Metrics come from calculation engine:                          │
 * │  - estimated_sold = opening + stock_in - closing                │
 * │  - revenue = sold × sell_price_at_time                          │
 * │  - profit = sold × (sell_price - buy_price)                     │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * 
 * ============================================
 * KEY OFFLINE-FIRST PRINCIPLES
 * ============================================
 * 
 * 1. ALL DATA LIVES IN SQLITE
 *    - No network calls during count flow
 *    - App works in airplane mode
 * 
 * 2. TRANSACTIONS FOR DATA INTEGRITY
 *    - All writes happen in single transaction
 *    - If anything fails, nothing is saved
 * 
 * 3. PRICE SNAPSHOTS FOR HISTORICAL ACCURACY
 *    - sell_price_at_time captured at COUNT time
 *    - Allows accurate profit calculation even after price changes
 * 
 * 4. PARTIAL COUNTS ARE FIRST-CLASS
 *    - User can count 3 of 50 products
 *    - Metrics show "Based on X products counted"
 *    - No penalty for incomplete data
 * 
 * 5. UNDO FOR SAFETY
 *    - Last count can be undone within 1 hour
 *    - Restores previous quantities
 * 
 * 
 * ============================================
 * COMPONENT STRUCTURE
 * ============================================
 * 
 * App.tsx
 * └── CountScreen             # Counting → Review → Results
 * 
 * src/core/
 * ├── calculations.ts         # Pure calculation functions
 * └── db.ts                   # Atomic save and one-hour undo
 * 
 * database/
 * └── schema.sql              # SQLite schema
 * 
 * 
 * ============================================
 * WIREFRAME: MOBILE LAYOUT
 * ============================================
 * 
 * Screen 1: COUNTING
 * ┌────────────────────────┐
 * │ Count Your Stock       │
 * │ Tap a product...       │
 * ├────────────────────────┤
 * │ [=========---] 75%     │
 * │ 3 of 4 counted         │
 * ├────────────────────────┤
 * │ ┌──────────────────┐   │
 * │ │ Bread        [10]│ ✓ │  48px row height
 * │ │ Was: 15          │   │
 * │ └──────────────────┘   │
 * │ ┌──────────────────┐   │
 * │ │ Coke     [-][12][+]│  │  Active: input shown
 * │ │ Was: 24          │   │
 * │ └──────────────────┘   │
 * │ ┌──────────────────┐   │
 * │ │ Chips   Tap to   │   │  Not counted yet
 * │ │ Was: 30   count  │   │
 * │ └──────────────────┘   │
 * ├────────────────────────┤
 * │ [  Review 3 Counted  ] │  Bottom button
 * └────────────────────────┘
 * 
 * Screen 2: REVIEW
 * ┌────────────────────────┐
 * │ Review Your Count      │
 * │ 3 products             │
 * ├────────────────────────┤
 * │ Bread                  │
 * │ Was: 15 → Now: 10 (-5) │
 * │                        │
 * │ Coke                   │
 * │ Was: 24 → Now: 12 (-12)│
 * ├────────────────────────┤
 * │ [Back]  [Save Count]   │
 * └────────────────────────┘
 * 
 * Screen 3: RESULTS
 * ┌────────────────────────┐
 * │          ✓             │
 * │    Count Saved!        │
 * │                        │
 * │ ┌──────┬──────┬──────┐ │
 * │ │  17  │ R256 │ R68  │ │
 * │ │ Sold │ Sales│Profit│ │
 * │ └──────┴──────┴──────┘ │
 * │                        │
 * │ "You sold 12 Coke,     │
 * │  making R36 profit."   │
 * │                        │
 * │ Based on 3 products.   │
 * │                        │
 * │      [ Done ]          │
 * └────────────────────────┘
 */

export {};
