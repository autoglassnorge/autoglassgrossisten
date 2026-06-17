-- Migration: Customer AI chat tables
-- Purpose: Store chat sessions, messages, and human handoffs for the customer-facing assistant.

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'web_chat',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','handed_off')),
  page_context TEXT,
  vehicle_context TEXT,
  context TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_token ON chat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
  role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_input TEXT,
  tool_output TEXT,
  candidates_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  preferred_contact TEXT DEFAULT 'chat' CHECK(preferred_contact IN ('chat','phone','email')),
  -- Internal operator/user identifier; no FK yet until operator auth is finalized.
  handled_by INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','claimed','resolved')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_handoffs_status ON chat_handoffs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_handoffs_session ON chat_handoffs(session_id);
