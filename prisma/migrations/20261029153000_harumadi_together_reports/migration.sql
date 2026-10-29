ALTER TABLE content_reports ADD COLUMN harumadi_id TEXT, ADD COLUMN comment_id TEXT,
  ADD COLUMN shared_hidden_at TIMESTAMP(3);
CREATE INDEX content_reports_harumadi_id_comment_id_idx ON content_reports(harumadi_id, comment_id);
CREATE INDEX harumadi_members_user_id_ended_at_joined_at_harumadi_id_idx ON harumadi_members(user_id, ended_at, joined_at, harumadi_id);
ALTER TABLE harumadi_invites ADD CONSTRAINT harumadi_invites_accepted_by_user_id_fkey
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
