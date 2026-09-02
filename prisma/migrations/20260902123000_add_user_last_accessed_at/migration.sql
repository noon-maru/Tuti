ALTER TABLE "users"
ADD COLUMN "last_accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "users" AS "user"
SET "last_accessed_at" = GREATEST(
  "user"."created_at",
  COALESCE(
    (
      SELECT MAX("session"."created_at")
      FROM "user_sessions" AS "session"
      WHERE "session"."user_id" = "user"."id"
    ),
    "user"."created_at"
  ),
  COALESCE(
    (
      SELECT MAX("device"."last_seen_at")
      FROM "push_devices" AS "device"
      WHERE "device"."user_id" = "user"."id"
    ),
    "user"."created_at"
  ),
  COALESCE(
    (
      SELECT MAX("action"."created_at")
      FROM "recommendation_actions" AS "action"
      WHERE "action"."user_id" = "user"."id"
    ),
    "user"."created_at"
  ),
  COALESCE(
    (
      SELECT MAX("entry"."updated_at")
      FROM "journal_entries" AS "entry"
      WHERE "entry"."owner_id" = "user"."id"
    ),
    "user"."created_at"
  )
);

CREATE INDEX "users_last_accessed_at_idx" ON "users"("last_accessed_at");
