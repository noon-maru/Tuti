CREATE TABLE notification_preferences (
 user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 news_enabled boolean NOT NULL DEFAULT false,
 reminder_enabled boolean NOT NULL DEFAULT false,
 reminder_time text NOT NULL DEFAULT '19:00' CHECK (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 time_zone text NOT NULL DEFAULT 'Asia/Seoul',
 updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE notification_book_settings (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 book_id text NOT NULL REFERENCES harumadis(id) ON DELETE CASCADE,
 muted boolean NOT NULL DEFAULT false,
 PRIMARY KEY (user_id, book_id)
);
CREATE TABLE notification_presence (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id text NOT NULL,
 book_id text REFERENCES harumadis(id) ON DELETE CASCADE,
 composing boolean NOT NULL DEFAULT false,
 expires_at timestamp(3) NOT NULL,
 PRIMARY KEY (user_id, session_id)
);
CREATE TABLE notification_jobs (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id text REFERENCES users(id) ON DELETE CASCADE,
 book_id text REFERENCES harumadis(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('shared-madi','invite-accepted','comment-reply','madi-reminder')),
 entity_id text,
 created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 due_at timestamp(3) NOT NULL,
 consumed_at timestamp(3)
);
CREATE INDEX notification_jobs_due ON notification_jobs(due_at) WHERE consumed_at IS NULL;
CREATE INDEX notification_jobs_retention ON notification_jobs(created_at);
CREATE TABLE notification_events (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL,
 action text NOT NULL CHECK(action IN ('opened','written','opt-in','denied','disabled')),
 created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_events_time ON notification_events(created_at);
CREATE TABLE notification_dispatch_status (
 id text PRIMARY KEY,
 checked_at timestamp(3) NOT NULL,
 processed integer NOT NULL,
 failed integer NOT NULL
);
