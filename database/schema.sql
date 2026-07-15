-- ============================================
-- SHOPTRACK DATABASE SCHEMA
-- ============================================
-- Philosophy: State-driven, not event-driven
-- Core insight: Sales = Previous Stock + Stock In - Current Stock
-- ============================================
--
-- REFERENCE ONLY. The app creates and migrates its tables from
-- src/core/schema.ts, which is the source of truth and is covered by
-- src/core/schema.test.ts. Keep this file in step with that module.
--
-- All timestamps are INTEGER unix milliseconds. This matters: the app
-- previously stored TEXT timestamps and compared them against ISO strings,
-- which sorts incorrectly ('2026-01-14 10:00' vs '2026-01-14T10:00Z' differ at
-- the separator, so same-day rows fell on the wrong side of a boundary).
-- ============================================


-- ============================================
-- TABLE: products
-- ============================================
-- The items a shop sells. Setup is gradual and imperfect.
-- No barcode required. No category required. Keep it simple.
--
-- Prices are nullable on purpose: an owner can add a product before they know
-- what it costs. Screens omit profit for these rather than showing R0.

CREATE TABLE products (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,                -- "Bread", "Coke 500ml", "Airtime R10"
    unit_label          TEXT DEFAULT 'units',         -- Display only: 'each', 'bottle', 'pack' (no math)
    buy_price           REAL,                         -- What owner pays (cost price); NULL = not yet known
    sell_price          REAL,                         -- What customer pays; NULL = not yet known
    current_qty         INTEGER NOT NULL DEFAULT 0,   -- Latest known quantity
    low_stock_threshold INTEGER DEFAULT 5,            -- Drives the low-stock nudge on Home
    is_active           INTEGER NOT NULL DEFAULT 1,   -- Soft delete (1=active, 0=hidden)
    created_at          INTEGER NOT NULL DEFAULT 0,   -- Unix timestamp (ms)
    updated_at          INTEGER NOT NULL DEFAULT 0    -- Unix timestamp (ms)
);

CREATE INDEX idx_products_active ON products(is_active);


-- ============================================
-- TABLE: stock_movements
-- ============================================
-- Every time stock changes, we record it.
-- Two types only: STOCK_IN (bought stock) and COUNT (physical count)
-- This is the HEART of the system.

CREATE TABLE stock_movements (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id          INTEGER NOT NULL,

    -- Movement type:
    -- 'STOCK_IN'  = Owner bought/received new stock
    -- 'COUNT'     = Owner counted what's left on shelf
    type                TEXT NOT NULL CHECK (type IN ('STOCK_IN', 'COUNT')),

    quantity            INTEGER NOT NULL,             -- For STOCK_IN: quantity added
                                                      -- For COUNT: absolute quantity remaining

    -- Price snapshots at time of movement (CRITICAL for historical accuracy).
    -- Without these, repricing a product silently rewrites past profit.
    buy_price_at_time   REAL,                         -- Unit cost paid (STOCK_IN only)
    sell_price_at_time  REAL,                         -- Shelf price at count time (COUNT only)

    total_cost          REAL,                         -- What the whole delivery cost (STOCK_IN)
    notes               TEXT,                         -- Optional ("damaged goods", "supplier X")
    session_id          INTEGER,                      -- Groups COUNT rows into one count session

    recorded_at         INTEGER NOT NULL,             -- When this was recorded (Unix ms)

    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_movements_product ON stock_movements(product_id);
CREATE INDEX idx_movements_type ON stock_movements(type);
CREATE INDEX idx_movements_date ON stock_movements(recorded_at);


-- ============================================
-- TABLE: count_sessions
-- ============================================
-- Groups multiple product counts into a single session.
-- "On Monday evening, I counted 15 products"
-- completed_at stays NULL if the owner walked away mid-count.

CREATE TABLE count_sessions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at          INTEGER NOT NULL,             -- When owner started counting (Unix ms)
    completed_at        INTEGER,                      -- When finished (NULL if incomplete)
    products_counted    INTEGER DEFAULT 0,            -- How many products were counted
    total_products      INTEGER DEFAULT 0,            -- How many were available to count
    notes               TEXT                          -- "End of week count"
);

CREATE INDEX idx_sessions_date ON count_sessions(started_at);


-- ============================================
-- TABLE: customers
-- ============================================
-- People who buy on credit -- the shop's book, izikweletu.
--
-- Phone is optional. Many regulars are known only by name, and demanding a
-- number would stop the owner recording the debt at all.

CREATE TABLE customers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    phone       TEXT,                             -- Optional
    is_active   INTEGER NOT NULL DEFAULT 1,       -- Soft delete; history is never removed
    created_at  INTEGER NOT NULL DEFAULT 0,       -- Unix timestamp (ms)
    updated_at  INTEGER NOT NULL DEFAULT 0        -- Unix timestamp (ms)
);

CREATE INDEX idx_customers_active ON customers(is_active);


-- ============================================
-- TABLE: credit_entries
-- ============================================
-- Every credit given and every payment received. Append-only.
--
-- Balances are NOT stored. They are summed from these rows on demand
-- (src/core/credit.ts). A stored balance that disagrees with its ledger is a
-- bug you cannot untangle after the fact; a ledger alone always reconciles.
--
-- A mistake is corrected by recording the opposite entry, never by editing or
-- deleting history.
--
-- WHY THIS IS SEPARATE FROM stock_movements:
-- Stock answers "did I make money?". Credit answers "where is the money?".
-- Goods taken on credit leave the shelf, so the count model already books the
-- sale -- but no cash arrived. The two are shown side by side and never
-- subtracted from each other, or the same sale gets counted twice.

CREATE TABLE credit_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER NOT NULL,

    -- 'CREDIT'  = customer took goods, owes more
    -- 'PAYMENT' = customer paid, owes less
    type         TEXT NOT NULL CHECK (type IN ('CREDIT', 'PAYMENT')),

    amount       REAL NOT NULL CHECK (amount > 0),  -- Always positive; type gives direction
    notes        TEXT,                              -- "Bread and milk"

    -- When the customer SAID they would pay, on a CREDIT entry. NULL means they
    -- did not say -- common, and it must stay allowed: demanding a date would
    -- stop the owner recording the debt at all. It is a promise, not a
    -- schedule. Nothing enforces it; it only lets the app say "this one is
    -- late", which is a sharper signal than mere silence.
    --
    -- Payments settle oldest debts first (FIFO, in src/core/credit.ts), so the
    -- live promise is the one on the oldest still-unpaid credit. Without that
    -- allocation, a customer who took credit in January (paid) and again in
    -- March would look overdue against January's kept promise forever.
    due_at       INTEGER,

    recorded_at  INTEGER NOT NULL,                  -- Unix timestamp (ms)

    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_credit_customer ON credit_entries(customer_id);
CREATE INDEX idx_credit_date ON credit_entries(recorded_at);


-- ============================================
-- TABLE: expenses
-- ============================================
-- What the shop pays out to stay open: rent, electricity, transport, wages,
-- airtime.
--
-- WHY: calculations.ts produces GROSS profit (revenue - cost of goods sold).
-- An owner who sees "R2,400 profit" but paid R500 rent did not make R2,400.
-- Net profit = gross - expenses, and net is the number they actually want.
--
-- ⚠️  STOCK PURCHASES DO NOT BELONG HERE.
-- Buying stock is already the cost side of gross profit: every unit sold is
-- valued at its buy_price. Recording a delivery here as well would charge the
-- owner twice for the same goods and invent a loss. Deliveries go through
-- Stock In (stock_movements). The category CHECK enforces this -- there is
-- deliberately no 'STOCK' option, and a test asserts it stays that way.
--
-- Categories are a fixed list rather than free text, or every shop invents its
-- own spelling of "electricity" and totals-by-category become meaningless.

CREATE TABLE expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category     TEXT NOT NULL CHECK (category IN
                   ('RENT', 'ELECTRICITY', 'TRANSPORT', 'WAGES', 'AIRTIME', 'OTHER')),
    amount       REAL NOT NULL CHECK (amount > 0),
    notes        TEXT,                              -- "Taxi to cash and carry"
    recorded_at  INTEGER NOT NULL                   -- Unix timestamp (ms)
);

CREATE INDEX idx_expenses_date ON expenses(recorded_at);
CREATE INDEX idx_expenses_category ON expenses(category);


-- ============================================
-- TABLE: cash_ups
-- ============================================
-- End-of-day till counts.
--
-- WHY: a shop can be profitable and still bleed cash. Stock walks, change is
-- given wrong, a sale goes in a pocket, an expense is paid and never written
-- down. None of that shows up in profit -- the stock left the shelf either way,
-- so the profit engine books the sale regardless. Only counting the cash finds
-- it. See src/core/cashup.ts for the full trail.
--
-- ⚠️  expected_amount and difference are SNAPSHOTS, deliberately stored.
--
-- Everything feeding "expected" keeps moving: a backdated expense, a late
-- stock-in, a corrected count all change what expected WOULD be if recomputed
-- next week. The owner counted their till against the number the app showed at
-- that moment, and that is the number the record must preserve. Recomputing
-- would silently rewrite history and turn a balanced cash-up into a shortfall
-- nobody can explain.
--
-- Contrast credit_entries, where balances are summed and never stored: there
-- the ledger IS the truth. Here the reconciliation is an event that happened.
--
-- NOTE: expected_amount may legitimately be negative (more cash paid out than
-- came in, so the owner topped up from elsewhere). counted_amount may not --
-- a till cannot hold less than nothing.

CREATE TABLE cash_ups (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    counted_amount   REAL NOT NULL CHECK (counted_amount >= 0),  -- What was in the till
    expected_amount  REAL NOT NULL,                              -- Snapshot; may be negative
    difference       REAL NOT NULL,                              -- Snapshot: counted - expected
    taken_out        REAL NOT NULL DEFAULT 0 CHECK (taken_out >= 0),
    is_opening       INTEGER NOT NULL DEFAULT 0,  -- First cash-up sets a float, does not reconcile
    notes            TEXT,
    recorded_at      INTEGER NOT NULL             -- Unix timestamp (ms)
);

CREATE INDEX idx_cash_ups_date ON cash_ups(recorded_at);


-- ============================================
-- TABLE: sales_entries
-- ============================================
-- The owner's own book: what the till took, and roughly what they keep of it.
--
-- WHY, ALONGSIDE stock_movements: counting stock needs two counts before it
-- says anything, and says nothing at all about the years before the app was
-- installed. Most owners already know they took R1,400 on Tuesday -- they just
-- don't know what it earned. profit = takings x margin% answers that today, and
-- answers it for January.
--
-- ⚠️  THIS IS A SECOND ESTIMATE OF THE SAME MONEY, NEVER AN EXTRA PILE OF IT.
-- Counted profit and book profit both answer "did I make money?". Adding them
-- counts one week of trading twice. src/core/sales.ts keeps them apart and the
-- screens show them as separate lenses. Where they disagree, THAT is the
-- interesting number: shrinkage, or a bad margin guess.
--
-- GRANULARITY
--   'DAY'   -> one day's takings, going forward.
--   'MONTH' -> one month's total, typed from an old paper book. Nobody keys in
--              180 individual days.
-- A month is either detailed (days) or summarised (one total), never both, or
-- the same trading is counted twice. UNIQUE(period, period_key) stops duplicate
-- rows; sales.ts reports a day/month clash rather than silently picking one.
--
-- period_key is TEXT, not a timestamp, on purpose. Everything else here is unix
-- ms because it marks an instant. A calendar month is not an instant -- it is a
-- label the owner recognises ("January") -- and storing it as a timestamp lets
-- timezone drift move takings into the wrong month.
--   DAY   -> 'YYYY-MM-DD'
--   MONTH -> 'YYYY-MM'
--
-- margin_pct is snapshotted per entry, like buy_price_at_time on a delivery.
-- Margins change; last year's profit must not move because bread was repriced
-- today.

CREATE TABLE sales_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    period       TEXT NOT NULL CHECK (period IN ('DAY', 'MONTH')),
    period_key   TEXT NOT NULL,                    -- 'YYYY-MM-DD' or 'YYYY-MM'
    amount       REAL NOT NULL CHECK (amount >= 0), -- Gross takings. 0 = shop was closed.
    margin_pct   REAL NOT NULL CHECK (margin_pct >= 0 AND margin_pct <= 100),
    notes        TEXT,
    recorded_at  INTEGER NOT NULL,                 -- Unix timestamp (ms)
    UNIQUE (period, period_key)
);

CREATE INDEX idx_sales_period ON sales_entries(period, period_key);


-- ============================================
-- NOT YET IMPLEMENTED
-- ============================================
-- Earlier drafts of this file defined period_snapshots, product_period_metrics
-- and app_settings. Nothing creates or reads them: the app computes period
-- metrics on demand via calculatePeriodSummary() in src/core/calculations.ts,
-- and stores preferences (language) in AsyncStorage.
--
-- Pre-computed snapshot tables are worth revisiting only if on-demand
-- calculation gets slow on a real shop's data. It has not.


-- ============================================
-- EXAMPLE DATA (for testing)
-- ============================================

-- Example products (common spaza shop items)
INSERT INTO products (name, unit_label, buy_price, sell_price, current_qty, is_active, created_at, updated_at) VALUES
    ('Bread (White)', 'loaf',    14.00, 18.00, 10, 1, 1705200000000, 1705200000000),
    ('Coke 500ml',    'bottle',  12.00, 15.00, 24, 1, 1705200000000, 1705200000000),
    ('Simba Chips',   'packet',   8.00, 12.00, 30, 1, 1705200000000, 1705200000000),
    ('Airtime R10',   'voucher',  9.50, 10.00, 50, 1, 1705200000000, 1705200000000),
    ('Milk 1L',       'carton',  18.00, 24.00,  8, 1, 1705200000000, 1705200000000);

-- Example: Owner bought stock on Monday (with price snapshot)
INSERT INTO stock_movements (product_id, type, quantity, buy_price_at_time, total_cost, recorded_at) VALUES
    (1, 'STOCK_IN', 20, 14.00, 280.00, 1705200000000),  -- Bought 20 bread @ R14
    (2, 'STOCK_IN', 48, 12.00, 576.00, 1705200000000),  -- Bought 48 cokes @ R12
    (3, 'STOCK_IN', 60,  8.00, 480.00, 1705200000000);  -- Bought 60 chips @ R8

-- Example: Owner counted stock on Friday (with price snapshot)
INSERT INTO stock_movements (product_id, type, quantity, sell_price_at_time, recorded_at) VALUES
    (1, 'COUNT', 10, 18.00, 1705632000000),  -- 10 bread left, selling @ R18
    (2, 'COUNT', 24, 15.00, 1705632000000),  -- 24 cokes left, selling @ R15
    (3, 'COUNT', 30, 12.00, 1705632000000);  -- 30 chips left, selling @ R12

-- The system now knows:
-- Bread: Had 20, now has 10 → Sold ~10 → Revenue R180, Profit R40
-- Coke:  Had 48, now has 24 → Sold ~24 → Revenue R360, Profit R72
-- Chips: Had 60, now has 30 → Sold ~30 → Revenue R360, Profit R120
