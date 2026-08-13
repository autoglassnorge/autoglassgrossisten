-- Migration 0026: Order approval + customer preferences
-- Decision 7B (Tom 2026-08-13): AI prepares the order on auto-glass.no via the
-- logged-in session — a human approves BEFORE it is submitted.
-- Decision 8A: full customer history (recognition + preferences + past orders).

CREATE TABLE IF NOT EXISTS pending_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL,
  customer_id INTEGER,
  regnr TEXT,
  vehicle TEXT,                -- JSON: {heading, model, chassis, body, ...}
  items TEXT NOT NULL,         -- JSON array: [{sku, name, qty, price, accessories:[{sku,name,price}]}]
  total REAL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_approval'
    CHECK(status IN ('awaiting_approval','approved','submitted','rejected')),
  approved_by TEXT,
  approved_at DATETIME,
  submitted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_orders_status ON pending_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_orders_customer ON pending_orders(customer_id);

CREATE TABLE IF NOT EXISTS customer_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  preference_key TEXT NOT NULL,     -- e.g. 'accessory:lim', 'accessory:primer', 'delivery_address'
  preference_value TEXT,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, preference_key),
  FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_prefs_customer ON customer_preferences(customer_id);
