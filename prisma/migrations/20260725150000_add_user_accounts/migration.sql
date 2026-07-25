ALTER TABLE "anonymous_users" RENAME TO "users";

ALTER TABLE "users"
ADD COLUMN "email" TEXT,
ADD COLUMN "password_hash" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "user_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_sessions_token_hash_key"
ON "user_sessions"("token_hash");

CREATE INDEX "user_sessions_user_id_idx"
ON "user_sessions"("user_id");

CREATE INDEX "user_sessions_expires_at_idx"
ON "user_sessions"("expires_at");

ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
