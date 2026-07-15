/**
 * ============================================
 * DAY 1 → DAY 7 ONBOARDING SIMULATION
 * ============================================
 * 
 * Persona: Thabo, 42
 * - Runs a spaza shop in Soweto
 * - Has a smartphone (Android, mid-range)
 * - Uses WhatsApp daily, nothing complex
 * - Cash business, no bank account
 * - Works 6am-9pm, busy during rush hours
 * - Wife helps sometimes
 * - Speaks English + Zulu, prefers simple English
 * - Has maybe 150 products, knows top 30 by heart
 * - Suspicious of apps that "want too much"
 * 
 * His question: "Am I actually making money?"
 */

/**
 * IMPLEMENTATION STATUS (pilot build 1.0.1)
 *
 * This file preserves the simulation that found the original gaps. The gaps
 * described below are historical rationale, not the current screen state:
 * - Home and Products both expose Count Stock.
 * - A first count shows a baseline result, never R0/negative profit.
 * - Count now has a no-write Review step and first-count-specific rows.
 * - Count save is transactional and the latest count can be undone for an hour.
 * - Product setup ends with a "You're ready to track" count prompt.
 * - The core loop is fully available in English and isiZulu.
 * - Home prompts the owner to count again after seven days.
 */
const IMPLEMENTATION_STATUS = {
  pilot_build: '1.0.1',
  P0_before_any_pilot: 'complete',
  P1_before_real_users: 'complete',
  P2_nice_to_have: 'complete',
  manual_gate_remaining: 'Run the upgrade, backup, restore, and tap-through on a real Android phone.',
} as const;

// ============================================
// 📅 DAY 1: INSTALL DAY (5 minutes max)
// ============================================

/**
 * CONTEXT:
 * Thabo's nephew told him about this app.
 * "It shows you your profit without writing everything down."
 * Thabo downloads it during a quiet moment (2pm, after lunch rush).
 * He has 5 minutes before customers come back.
 */

const DAY_1_WALKTHROUGH = {
  
  // SCREEN 1: App opens for first time
  step_1: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │         📦                 │
      │    No Products Yet         │
      │                            │
      │  Add your first product    │
      │  to start tracking your    │
      │  profit.                   │
      │                            │
      │  [+ Add First Product]     │
      │                            │
      │  Start with your top 5-10  │
      │  sellers. You can add more │
      │  anytime.                  │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "Okay, so I add products first. Makes sense.",
    
    friction_points: [
      "📦 emoji might not render on all Android phones",
      "'tracking your profit' - does he understand profit = sell - buy?",
      "'top 5-10 sellers' - good guidance, but maybe '5' is enough pressure",
    ],
    
    copy_improvement: {
      before: "Add your first product to start tracking your profit.",
      after: "Add what you sell. We'll show you how much you make.",
      why: "More direct, less jargon, promise of value upfront",
    },
  },
  
  // SCREEN 2: Add Product Screen
  step_2: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │ Cancel    Add Product      │
      ├────────────────────────────┤
      │                            │
      │ Product Name *             │
      │ ┌────────────────────────┐ │
      │ │ e.g. Bread, Coke 500ml │ │
      │ └────────────────────────┘ │
      │ What do you call this      │
      │ product?                   │
      │                            │
      │ Buy Price      Sell Price  │
      │ ┌─────────┐   ┌─────────┐  │
      │ │ R 0.00  │   │ R 0.00  │  │
      │ └─────────┘   └─────────┘  │
      │ You pay       Customer pays│
      │                            │
      │ Starting Quantity          │
      │ ┌────────────────────────┐ │
      │ │ How many do you have?  │ │
      │ └────────────────────────┘ │
      │ Optional - you can count   │
      │ later                      │
      │                            │
      │ [    Save Product    ]     │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "Name... Bread. Buy price... I pay R14. Sell... R18. Easy.",
    
    friction_points: [
      "'Product Name *' - asterisk might confuse non-tech users",
      "'Buy Price' / 'Sell Price' - GOOD, but 'You pay' / 'Customer pays' below is even better. Lead with that.",
      "'Starting Quantity' - 'How many do you have now?' is clearer",
      "No margin preview until both prices entered - feels like nothing is happening",
    ],
    
    copy_improvements: [
      {
        before: "Product Name *",
        after: "What do you sell?",
        why: "Question format is friendlier than label format",
      },
      {
        before: "Buy Price",
        after: "You pay (cost)",
        why: "Parenthetical clarifies without adding fields",
      },
      {
        before: "Starting Quantity",
        after: "How many do you have now?",
        why: "Question is clearer than label",
      },
    ],
    
    good_things: [
      "'You pay' / 'Customer pays' labels are excellent",
      "Optional quantity with 'you can count later' is perfect",
      "Live margin preview builds trust",
    ],
  },
  
  // SCREEN 3: Success after adding Bread
  step_3: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │            ✓               │
      │     Product Added!         │
      │                            │
      │     Bread is ready.        │
      │     You can count it       │
      │     anytime.               │
      │                            │
      │  [   Add Another   ]       │
      │  [  Done for Now   ]       │
      │                            │
      │  Tip: You don't need to    │
      │  add all products now.     │
      │  Start with your top       │
      │  sellers.                  │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "Nice. Let me add Coke and Chips too.",
    
    friction_points: [
      "'You can count it anytime' - count what? He hasn't learned about counting yet.",
      "Tip is good but 'top sellers' is vague - maybe 'the things you sell most'",
    ],
    
    copy_improvement: {
      before: "You can count it anytime.",
      after: "Ready to track.",
      why: "Simpler. Don't introduce 'counting' concept yet.",
    },
  },
  
  // Thabo adds 2 more products (Coke, Chips), then stops
  step_4: {
    action: "Thabo taps 'Done for Now' after adding 3 products",
    
    what_happens: "??? - We haven't designed where this goes",
    
    critical_gap: `
      ⚠️ MAJOR FRICTION: Where does "Done for Now" take him?
      
      Options:
      A) Home screen with product list - feels incomplete
      B) Dashboard with no data - confusing
      C) Simple "You're set" confirmation - best option
      
      MISSING SCREEN: "You're Ready" confirmation that:
      - Celebrates progress
      - Explains next step (counting)
      - Sets expectation ("Count in a few days to see profit")
    `,
  },
  
  // DAY 1 SUMMARY
  day_1_summary: {
    time_spent: "4 minutes",
    products_added: 3,
    emotional_state: "Cautiously optimistic",
    trust_level: "Low - hasn't seen value yet",
    
    what_went_well: [
      "Adding products was fast",
      "Didn't require email/login",
      "Margin preview showed profit potential",
    ],
    
    what_could_break_trust: [
      "No clear next step after setup",
      "Doesn't know when/how to 'count'",
      "No explanation of HOW app calculates profit",
    ],
    
    critical_missing_element: `
      MISSING: "How it works" explanation
      
      Thabo doesn't understand the magic yet.
      He needs ONE sentence:
      
      "When you count what's left, we figure out what sold."
      
      This should appear somewhere on Day 1.
    `,
  },
};

// ============================================
// 📅 DAY 3: FIRST COUNT (2 minutes)
// ============================================

/**
 * CONTEXT:
 * Thabo has sold stock for 2 days.
 * It's Sunday evening, shop is quiet.
 * He remembers the app and opens it.
 * He wants to see if it actually works.
 */

const DAY_3_WALKTHROUGH = {
  
  // SCREEN 1: Home/Product List
  step_1: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │ Products                   │
      │ ┌────────────────────────┐ │
      │ │ 🔍 Search products...  │ │
      │ └────────────────────────┘ │
      ├────────────────────────────┤
      │  3      │   3    │   0     │
      │Products │ Prices │In Stock │
      ├────────────────────────────┤
      │ Bread         R18.00       │
      │ (R4.00 profit)        0 ›  │
      │                            │
      │ Chips         R12.00       │
      │ (R4.00 profit)        0 ›  │
      │                            │
      │ Coke          R15.00       │
      │ (R3.00 profit)        0 ›  │
      ├────────────────────────────┤
      │              [+]           │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "All say 0 stock. But I have stock! Where do I count?",
    
    critical_friction: `
      ⚠️ MAJOR PROBLEM: No obvious "Count Stock" button
      
      Current design shows product list with FAB (+) for adding.
      But the PRIMARY action at this point is COUNTING, not adding.
      
      Thabo doesn't know how to start counting.
    `,
    
    solution: `
      Need a prominent entry point to counting.
      
      Options:
      A) "Count Stock" button at top of product list
      B) Bottom navigation with "Count" tab
      C) Banner: "Ready to count? Tap here"
      
      Best: Contextual banner when stock is 0:
      "You have stock to count → Start counting"
    `,
  },
  
  // SCREEN 2: Stock Count Flow (assuming he finds it)
  step_2: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │ Count Your Stock           │
      │ Tap a product and enter    │
      │ how many you have          │
      ├────────────────────────────┤
      │ [                    ] 0%  │
      │ Tap any product to start   │
      ├────────────────────────────┤
      │ Bread                      │
      │ Last: 0 each       [Count] │
      │                            │
      │ Chips                      │
      │ Last: 0 each       [Count] │
      │                            │
      │ Coke                       │
      │ Last: 0 bottle     [Count] │
      ├────────────────────────────┤
      │ [ Count at least 1 prod ]  │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "Okay, let me count Bread. I have... 8 loaves left.",
    
    friction_points: [
      "'Last: 0 each' - confusing because he never counted before",
      "Should say 'Not counted yet' for first time",
    ],
    
    good_things: [
      "[Count] button is clear",
      "Partial count is allowed (button text changes)",
      "'Tap any product to start' is encouraging",
    ],
    
    copy_improvement: {
      before: "Last: 0 each",
      after: "Not counted yet",
      why: "First count has no 'last' - acknowledge this",
    },
  },
  
  // SCREEN 3: Counting Bread
  step_3: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │ Bread                      │
      │ Not counted yet            │
      │                            │
      │ [Same]  [-] [ 8 ] [+]      │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "8. Done. Next.",
    
    friction_points: [
      "'Same' button - same as what? He never counted before.",
      "Should hide 'Same' on first count",
    ],
    
    copy_improvement: {
      context: "First count scenario",
      fix: "Hide 'Same' button when previous count is 0 or null",
      why: "'Same as before' makes no sense on first count",
    },
  },
  
  // SCREEN 4: Review
  step_4: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │ Review Your Count          │
      │ 2 products counted         │
      ├────────────────────────────┤
      │ Bread                      │
      │ Was: 0 → Now: 8  (+8)      │
      │                            │
      │ Coke                       │
      │ Was: 0 → Now: 15 (+15)     │
      ├────────────────────────────┤
      │ [Go Back]    [Save Count]  │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "Was 0, now 8... but I didn't have 0, I just didn't count yet.",
    
    critical_confusion: `
      ⚠️ PROBLEM: "Was: 0 → Now: 8 (+8)" looks like he GAINED stock
      
      But he didn't gain anything - this is FIRST COUNT.
      The +8 feels wrong. It looks like stock appeared from nowhere.
      
      First count should show differently:
      "First count: 8 bread"
      
      NOT "Was: 0 → Now: 8 (+8)"
    `,
    
    solution: `
      Detect first count (previous was 0 or null) and show:
      
      "Bread — First count: 8"
      
      Instead of:
      
      "Bread — Was: 0 → Now: 8 (+8)"
    `,
  },
  
  // SCREEN 5: Results
  step_5: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │            ✓               │
      │      Count Saved!          │
      │                            │
      │      Your Profit           │
      │         R0                 │
      │                            │
      │    ┌───────┬───────┐       │
      │    │   0   │  R0   │       │
      │    │ Sold  │ Sales │       │
      │    └───────┴───────┘       │
      │                            │
      │  Based on 2 products       │
      │  counted.                  │
      │                            │
      │       [ Done ]             │
      └────────────────────────────┘
    `,
    
    thabo_reaction: "R0 profit?! But I sold things! This app doesn't work!",
    
    critical_failure: `
      ⚠️⚠️⚠️ TRUST DESTROYED ⚠️⚠️⚠️
      
      This is the WORST possible outcome.
      
      Thabo sold stock for 2 days.
      He knows he made money.
      App says R0.
      
      He will DELETE THE APP.
      
      WHY THIS HAPPENS:
      - First count has no baseline
      - estimated_sold = opening (0) + stock_in (0) - closing (8) = -8
      - We clamp to 0, so sold = 0
      - Profit = 0
      
      THE APP IS TECHNICALLY CORRECT BUT EMOTIONALLY WRONG.
    `,
    
    solution: `
      FIRST COUNT MUST BE HANDLED DIFFERENTLY.
      
      When this is the first count ever, don't show profit.
      Show instead:
      
      ┌────────────────────────────┐
      │            ✓               │
      │    First Count Done!       │
      │                            │
      │    You have:               │
      │    • 8 Bread               │
      │    • 15 Coke               │
      │                            │
      │    Next time you count,    │
      │    we'll show your profit. │
      │                            │
      │       [ Got It ]           │
      └────────────────────────────┘
      
      This is HONEST. It explains WHY no profit yet.
      It sets up the NEXT count as the reward.
    `,
  },
  
  // DAY 3 SUMMARY
  day_3_summary: {
    time_spent: "2 minutes",
    products_counted: 2,
    emotional_state: "CONFUSED / DISAPPOINTED",
    trust_level: "BROKEN if we show R0 profit",
    
    critical_failure: "First count showing R0 profit",
    
    required_fix: `
      Detect "first count ever" scenario.
      Show different results screen.
      Set expectation for NEXT count.
    `,
  },
};

// ============================================
// 📅 DAY 7: TRUST MOMENT (3 minutes)
// ============================================

/**
 * CONTEXT:
 * Thabo has been selling for 4 more days since first count.
 * He received one delivery (stock-in) mid-week.
 * He opens app Sunday evening again.
 * This is the MOMENT OF TRUTH.
 */

const DAY_7_WALKTHROUGH = {
  
  // Assumption: We fixed Day 3 issues. First count was handled properly.
  
  // SCREEN 1: Start counting
  step_1: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │ Count Your Stock           │
      │ Tap a product and enter    │
      │ how many you have          │
      ├────────────────────────────┤
      │ [====                ] 0%  │
      │ Tap any product to start   │
      ├────────────────────────────┤
      │ Bread                      │
      │ Last: 8 loaf       [Count] │
      │                            │
      │ Coke                       │
      │ Last: 15 bottle    [Count] │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "Last time I had 8 bread. Let me count again.",
    
    good: "'Last: 8 loaf' now makes sense - there was a previous count",
  },
  
  // SCREEN 2: Count bread (now has 3)
  step_2: {
    thabo_action: "Enters 3 for Bread (started with 8, sold 5)",
    
    what_he_sees: `
      Row turns green, shows "3" ✓
    `,
    
    good: "Quick, visual feedback",
  },
  
  // SCREEN 3: Count Coke (now has 9)  
  step_3: {
    thabo_action: "Enters 9 for Coke (started with 15, sold 6)",
    notes: "He also received 10 more cokes mid-week but didn't record it",
  },
  
  // SCREEN 4: Review
  step_4: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │ Review Your Count          │
      │ 2 products counted         │
      ├────────────────────────────┤
      │ Bread                      │
      │ Was: 8 → Now: 3  (-5)      │
      │                            │
      │ Coke                       │
      │ Was: 15 → Now: 9 (-6)      │
      ├────────────────────────────┤
      │ [Go Back]    [Save Count]  │
      └────────────────────────────┘
    `,
    
    thabo_thinks: "5 bread sold, 6 coke sold. That sounds right!",
    
    friction_point: `
      ⚠️ PROBLEM: Coke is WRONG
      
      Reality:
      - Started with 15
      - Received 10 more (stock-in, not recorded)
      - Sold 16
      - Left with 9
      
      App thinks:
      - Started with 15
      - Sold 6 (15 - 9)
      - Left with 9
      
      App UNDERREPORTS sales because stock-in wasn't recorded.
      
      This is EXPECTED behavior but Thabo doesn't know why.
      If he later records stock-in, history will be more accurate.
      
      For now: This is acceptable inaccuracy.
      The app still shows SOME profit, which is better than R0.
    `,
  },
  
  // SCREEN 5: Results (THE MOMENT)
  step_5: {
    what_thabo_sees: `
      ┌────────────────────────────┐
      │            ✓               │
      │      Count Saved!          │
      │                            │
      │      Your Profit           │
      │         R38                │
      │                            │
      │    ┌───────┬───────┐       │
      │    │  11   │ R198  │       │
      │    │ Sold  │ Sales │       │
      │    └───────┴───────┘       │
      │                            │
      │  "You sold 5 Bread,        │
      │   making R20 profit."      │
      │                            │
      │  Based on 2 products       │
      │  counted.                  │
      │                            │
      │       [ Done ]             │
      └────────────────────────────┘
    `,
    
    thabo_reaction: "R38! I made money! This actually works!",
    
    emotional_state: "TRUST ESTABLISHED",
    
    calculation_check: `
      Bread: 5 sold × R4 profit = R20
      Coke:  6 sold × R3 profit = R18
      Total: R38
      
      (Actually undersold because stock-in wasn't recorded,
       but Thabo doesn't know and doesn't care.
       R38 is a REAL number he can feel.)
    `,
    
    what_happens_next: `
      Thabo will:
      1. ✅ Keep using the app
      2. ✅ Add more products
      3. ✅ Maybe tell his wife / other shop owners
      4. ⚠️ Eventually notice stock-in gap
      5. 📈 Gradually improve data quality
      
      THIS IS THE ADOPTION PATH.
    `,
  },
  
  // DAY 7 SUMMARY
  day_7_summary: {
    time_spent: "2 minutes",
    products_counted: 2,
    profit_shown: "R38",
    emotional_state: "SATISFIED / TRUSTING",
    
    key_insight: `
      Even with missing stock-in data,
      the app showed a BELIEVABLE profit number.
      
      Imperfect data with honest presentation
      beats perfect data that never gets collected.
    `,
    
    next_natural_action: "Thabo will add more products next week",
  },
};

// ============================================
// 🔴 CRITICAL FINDINGS (MUST FIX)
// ============================================

const CRITICAL_FINDINGS = {
  
  must_fix_before_pilot: [
    {
      issue: "First count shows R0 profit",
      severity: "🔴 CRITICAL - will cause uninstalls",
      solution: "Detect first count, show 'baseline set' screen instead of profit",
      screens_affected: ["ResultsScreen in StockCountFlow"],
    },
    {
      issue: "No way to navigate to 'Count Stock' from product list",
      severity: "🔴 CRITICAL - users can't find core feature",
      solution: "Add 'Count Stock' button/banner on home screen",
      screens_affected: ["ProductListScreen", "need HomeScreen"],
    },
    {
      issue: "'Same' button appears on first count",
      severity: "🟡 CONFUSING",
      solution: "Hide 'Same' button when previous_qty is 0 or null",
      screens_affected: ["ProductCountRow in StockCountFlow"],
    },
    {
      issue: "Review screen shows 'Was: 0 → Now: X (+X)' on first count",
      severity: "🟡 CONFUSING",
      solution: "Show 'First count: X' instead of delta on first count",
      screens_affected: ["ReviewScreen in StockCountFlow"],
    },
    {
      issue: "No 'how it works' explanation anywhere",
      severity: "🟡 TRUST GAP",
      solution: "Add one sentence: 'Count what's left, we calculate what sold'",
      screens_affected: ["Onboarding or first empty state"],
    },
  ],
  
  copy_improvements: [
    { screen: "Empty state", before: "Add your first product to start tracking your profit", after: "Add what you sell. We'll show you how much you make." },
    { screen: "Add product", before: "Product Name *", after: "What do you sell?" },
    { screen: "Add product", before: "Buy Price", after: "You pay (cost)" },
    { screen: "Add product", before: "Starting Quantity", after: "How many now? (optional)" },
    { screen: "Success", before: "You can count it anytime", after: "Ready to track" },
    { screen: "Count row", before: "Last: 0 each", after: "Not counted yet" },
    { screen: "Progress", before: "Tap any product to start", after: "Tap a product → enter how many" },
  ],
  
  one_thing_to_remove: {
    what: "The asterisk (*) on required fields",
    why: "Non-tech users don't know what asterisk means. If only name is required, just make the button say 'Save' and show error if empty. Don't use symbols.",
  },
};

// ============================================
// ✅ WHAT'S WORKING WELL
// ============================================

const WORKING_WELL = [
  "Product setup is fast (< 1 minute per product)",
  "Partial counts allowed and encouraged",
  "'You pay' / 'Customer pays' labels are perfect",
  "Profit-first results screen",
  "Truth statements ('You sold 5 Bread, making R20')",
  "No login/email required",
  "Undo feature removes fear",
  "Gradual setup messaging ('Start with top sellers')",
];

// ============================================
// 🎯 REQUIRED CHANGES (PRIORITY ORDER)
// ============================================

const REQUIRED_CHANGES = {
  
  P0_before_any_pilot: [
    "1. First count detection → different results screen",
    "2. Home screen with 'Count Stock' entry point",
  ],
  
  P1_before_real_users: [
    "3. Hide 'Same' button on first count",
    "4. Review screen: 'First count: X' vs 'Was: 0 → Now: X'",
    "5. Copy improvements (all listed above)",
  ],
  
  P2_nice_to_have: [
    "6. 'How it works' explanation",
    "7. Reminder to count (after 7 days)",
  ],
};

export {
  IMPLEMENTATION_STATUS,
  DAY_1_WALKTHROUGH,
  DAY_3_WALKTHROUGH,
  DAY_7_WALKTHROUGH,
  CRITICAL_FINDINGS,
  WORKING_WELL,
  REQUIRED_CHANGES,
};
