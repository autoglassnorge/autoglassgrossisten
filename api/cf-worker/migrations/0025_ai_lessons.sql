-- Migration 0025: AI Lessons (LLM learning engine)
-- Durable lessons extracted from completed conversations, auto-applied
-- on subsequent dialogue turns (weighted, confidence-gated).
-- Decisions (Tom 2026-08-13): 2D = learn everything weighted; 3A = auto-apply.

CREATE TABLE IF NOT EXISTS ai_lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global','make','make_model','position')),
  scope_key TEXT NOT NULL DEFAULT '',
  lesson_type TEXT NOT NULL DEFAULT 'dialogue' CHECK(lesson_type IN ('accessory','equipment','dialogue','pricing')),
  content TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'conversation',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope, scope_key, lesson_type, content)
);

CREATE INDEX IF NOT EXISTS idx_ai_lessons_scope ON ai_lessons(scope, scope_key);
CREATE INDEX IF NOT EXISTS idx_ai_lessons_type ON ai_lessons(lesson_type);
CREATE INDEX IF NOT EXISTS idx_ai_lessons_rank ON ai_lessons(weight DESC, confidence DESC);
