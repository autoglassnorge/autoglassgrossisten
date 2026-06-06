CREATE TABLE IF NOT EXISTS b2b_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_nr TEXT UNIQUE,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  price_tier TEXT DEFAULT 'standard',
  payment_terms TEXT DEFAULT 'faktura',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  regnr TEXT,
  vin TEXT,
  glass_sku TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price_per_unit REAL,
  total REAL,
  accessories TEXT,
  status TEXT DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'chat',
  session_token TEXT UNIQUE NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_token ON ai_sessions(session_token);
