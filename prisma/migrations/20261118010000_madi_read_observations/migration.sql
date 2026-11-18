ALTER TABLE lifecycle_events DROP CONSTRAINT lifecycle_events_name_check;
ALTER TABLE lifecycle_events ADD CONSTRAINT lifecycle_events_name_check CHECK (name IN (
  'madi_created','harumadi_created','madi_added','invite_created','invite_accepted','shared_first_contribution','pdf_created',
  'home_viewed','explore_viewed','compose_started','compose_exited','draft_restored','book_opened','madi_opened','invite_viewed','purchase_viewed','purchase_clicked',
  'pdf_exported','compose_failed','pdf_failed','invite_failed','daily_active','session_started','session_active'));
