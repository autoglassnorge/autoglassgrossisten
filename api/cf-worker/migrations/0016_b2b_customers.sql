-- B2B Customers, Order History, and AI Sessions for Ordremottaker
-- ============================================================================

CREATE TABLE IF NOT EXISTS b2b_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_nr TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  price_tier TEXT DEFAULT 'standard',
  payment_terms TEXT DEFAULT 'net_14',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  regnr TEXT,
  vin TEXT,
  glass_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_per_unit REAL NOT NULL,
  total REAL NOT NULL,
  accessories TEXT,        -- JSON array of AccessoryItem
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
);

CREATE INDEX IF NOT EXISTS idx_order_history_customer ON order_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_history_regnr ON order_history(regnr);
CREATE INDEX IF NOT EXISTS idx_order_history_created ON order_history(created_at);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'web',
  session_token TEXT NOT NULL UNIQUE,
  context TEXT NOT NULL,   -- JSON: messages, extractedVehicle, candidates, etc.
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_token ON ai_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_customer ON ai_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_status ON ai_sessions(status);
