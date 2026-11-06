ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check
  CHECK (kind IN ('shared-madi','invite-accepted','comment-reply','madi-reminder','inquiry-answered'));
