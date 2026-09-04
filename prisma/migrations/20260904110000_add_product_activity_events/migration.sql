CREATE TYPE "ProductActivityType" AS ENUM (
  'session_started',
  'entry_started',
  'entry_completed',
  'entry_skipped',
  'main_viewed'
);

CREATE TYPE "ProductActivityPlatform" AS ENUM ('web', 'android', 'ios');

CREATE TABLE "product_activity_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "client_session_id" TEXT NOT NULL,
  "action" "ProductActivityType" NOT NULL,
  "platform" "ProductActivityPlatform" NOT NULL,
  "app_version" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retention_until" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_activity_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_activity_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "product_activity_events_user_id_client_session_id_action_key"
ON "product_activity_events"("user_id", "client_session_id", "action");

CREATE INDEX "product_activity_events_user_id_created_at_idx"
ON "product_activity_events"("user_id", "created_at");

CREATE INDEX "product_activity_events_action_created_at_idx"
ON "product_activity_events"("action", "created_at");

CREATE INDEX "product_activity_events_client_session_id_created_at_idx"
ON "product_activity_events"("client_session_id", "created_at");

CREATE INDEX "product_activity_events_retention_until_idx"
ON "product_activity_events"("retention_until");
