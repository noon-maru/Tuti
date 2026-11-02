ALTER TABLE lifecycle_events ADD COLUMN active_milliseconds INTEGER, ADD COLUMN active_started_at TIMESTAMP(3);
ALTER TABLE lifecycle_events DROP CONSTRAINT lifecycle_events_name_check;
ALTER TABLE lifecycle_events ADD CONSTRAINT lifecycle_events_name_check CHECK (name IN (
  'madi_created','harumadi_created','madi_added','invite_created','invite_accepted','shared_first_contribution','pdf_created',
  'home_viewed','explore_viewed','compose_started','compose_exited','draft_restored','book_opened','invite_viewed','purchase_viewed','purchase_clicked',
  'pdf_exported','compose_failed','pdf_failed','invite_failed','daily_active','session_started','session_active'));
ALTER TABLE lifecycle_events ADD CONSTRAINT lifecycle_active_duration_check CHECK (
  (name='session_active' AND session_id IS NOT NULL AND active_milliseconds IS NOT NULL AND active_started_at IS NOT NULL
    AND active_milliseconds BETWEEN 1 AND 30000 AND active_started_at = occurred_at - active_milliseconds * INTERVAL '1 millisecond')
  OR (name <> 'session_active' AND active_milliseconds IS NULL AND active_started_at IS NULL)
);
