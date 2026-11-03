CREATE TABLE user_data_cleanup_jobs (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until TIMESTAMP(3)
);
CREATE INDEX user_data_cleanup_jobs_next_attempt_at_lease_until_idx
  ON user_data_cleanup_jobs(next_attempt_at, lease_until);
