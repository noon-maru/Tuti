CREATE TABLE lifecycle_events (
  id TEXT PRIMARY KEY, occurrence_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT NOT NULL, entity_id TEXT, book_id TEXT, request_key TEXT UNIQUE, request_hash TEXT,
  session_id TEXT, flow_id TEXT, source TEXT NOT NULL DEFAULT 'unknown', platform TEXT NOT NULL DEFAULT 'unknown',
  app_version TEXT, origin TEXT, version INTEGER NOT NULL DEFAULT 1,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, retention_until TIMESTAMP(3) NOT NULL,
  CHECK (name IN ('madi_created','harumadi_created','madi_added','invite_created','invite_accepted','shared_first_contribution','pdf_created',
    'home_viewed','explore_viewed','compose_started','book_opened','invite_viewed','purchase_viewed','purchase_clicked','pdf_exported','compose_failed','pdf_failed','invite_failed','daily_active','session_started')),
  CHECK (source IN ('home','explore','book','invite','unknown')),
  CHECK (platform IN ('web','android','ios','unknown')),
  CHECK (origin IS NULL OR origin IN ('manual','first_madi_auto','existing_selection','within_book','download','share_sheet','cancelled','request_failed')),
  CHECK (version=1), CHECK (retention_until > occurred_at)
);
CREATE INDEX lifecycle_user_name_time ON lifecycle_events(user_id,name,occurred_at);
CREATE INDEX lifecycle_name_time ON lifecycle_events(name,occurred_at);
CREATE INDEX lifecycle_book_name_time ON lifecycle_events(book_id,name,occurred_at);
CREATE INDEX lifecycle_retention ON lifecycle_events(retention_until);
