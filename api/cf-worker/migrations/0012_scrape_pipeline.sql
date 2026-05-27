-- Migration 0012: Scrape Pipeline for kType + Rutenummer-dekning
-- Formål: Orkestrering, lagring og scoring av scrape-resultater fra multiple kilder

-- -----------------------------------------------------------------------
-- 1. scrape_jobs — orkestrering og sporing av scrape-runs
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL, -- 'ebay_ktype' | 'finn_regnr' | 'pdf_oe' | 'pivot_crossref' | 'tecdoc_api'
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | cancelled
  params TEXT NOT NULL DEFAULT '{}', -- JSON: {brand, model, year_range, source, batch_size}
  items_found INTEGER DEFAULT 0,
  items_valid INTEGER DEFAULT 0,
  items_written INTEGER DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  error_log TEXT
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_type_status
  ON scrape_jobs (job_type, status);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_started_at
  ON scrape_jobs (started_at DESC);

-- -----------------------------------------------------------------------
-- 2. scrape_results — rå resultater før confidence scoring
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  source TEXT NOT NULL, -- 'ebay' | 'finn' | 'pdf' | 'pivot' | 'tecdoc_api' | 'bovsoft' | 'svv'
  ktype INTEGER,
  make TEXT,
  model TEXT,
  year INTEGER,
  eurocode TEXT,
  oem_number TEXT,
  article_number TEXT,
  glass_part_type TEXT, -- 'windshield' | 'backglass' | 'sideglass' | 'door' | 'sunroof'
  raw_payload TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'raw', -- raw | validated | rejected | merged | stale
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scrape_results_job_id
  ON scrape_results (job_id);

CREATE INDEX IF NOT EXISTS idx_scrape_results_source_status
  ON scrape_results (source, status);

CREATE INDEX IF NOT EXISTS idx_scrape_results_ktype
  ON scrape_results (ktype);

CREATE INDEX IF NOT EXISTS idx_scrape_results_eurocode
  ON scrape_results (eurocode);

CREATE INDEX IF NOT EXISTS idx_scrape_results_confidence
  ON scrape_results (confidence DESC);

CREATE INDEX IF NOT EXISTS idx_scrape_results_ktype_eurocode
  ON scrape_results (ktype, eurocode);
