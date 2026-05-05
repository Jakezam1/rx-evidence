CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  total_pages INTEGER,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  clinical_implication TEXT NOT NULL,
  statistics_json JSON NOT NULL,
  confidence_level TEXT NOT NULL,
  evidence_strength_score REAL,
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  review_note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finding_sources (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  text_excerpt TEXT NOT NULL,
  section_name TEXT NOT NULL,
  page_hint TEXT NOT NULL,
  paragraph_hint TEXT,
  anchor_type TEXT NOT NULL,
  anchor_match_score REAL
);

CREATE TABLE IF NOT EXISTS pico_snapshots (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  population TEXT,
  intervention TEXT,
  comparator TEXT,
  outcomes_json JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_limitations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  internal_validity TEXT,
  external_validity TEXT,
  sponsorship_conflict TEXT,
  composite_endpoint_assessment TEXT,
  subgroup_assessment TEXT
);

CREATE TABLE IF NOT EXISTS observability_events (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  analysis_run_id TEXT REFERENCES analysis_runs(id),
  stage TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
