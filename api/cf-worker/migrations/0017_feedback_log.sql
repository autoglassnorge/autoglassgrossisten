-- Migration 0017: Feedback Log for Auto Ground Truth Building
-- ========================================================================
-- Hver gang en kunde får et glass anbefalt og gir feedback (ja/nei/vet ikke),
-- logges det her. Feedback brukes til å:
--   1. Bygge opp ground_truth automatisk
--   2. Forbedre fremtidige anbefalinger for samme regnr
--   3. Lære hvilke kandidater AI ofte velger feil

CREATE TABLE IF NOT EXISTS feedback_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL,
  regnr_hash TEXT,                  -- SHA-256 hash (GDPR-safe)
  vin TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  position TEXT NOT NULL,           -- frontrute, bakrute, dørrute, siderute
  recommended_eurocode TEXT,        -- Hva AI anbefalte
  chosen_eurocode TEXT,             -- Hva kunden faktisk valgte
  was_correct INTEGER NOT NULL DEFAULT 0,  -- 1=ja, 0=nei, -1=vet_ikke
  correction_eurocode TEXT,         -- Hvis was_correct=0, hva var riktig?
  correction_reason TEXT,           -- Hvis was_correct=0, hva var feil?
  equipment_answers TEXT,           -- JSON: {adas, heated, rainSensor, ...}
  source TEXT DEFAULT 'ai_chat',    -- ai_chat, search_page, phone
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indekser for vanlige lookups
CREATE INDEX IF NOT EXISTS idx_feedback_regnr ON feedback_log(regnr_hash);
CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback_log(session_token);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_log(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_correct ON feedback_log(was_correct, position);
