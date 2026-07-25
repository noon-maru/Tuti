CREATE TABLE "anonymous_users" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "anonymous_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "anonymous_users_token_hash_key"
ON "anonymous_users"("token_hash");

INSERT INTO "anonymous_users" (
  "id",
  "token_hash",
  "created_at",
  "updated_at"
)
VALUES (
  'legacy-journal-owner',
  '0000000000000000000000000000000000000000000000000000000000000000',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

ALTER TABLE "journal_entries"
ADD COLUMN "owner_id" TEXT;

UPDATE "journal_entries"
SET "owner_id" = 'legacy-journal-owner'
WHERE "owner_id" IS NULL;

ALTER TABLE "journal_entries"
ALTER COLUMN "owner_id" SET NOT NULL;

DROP INDEX "journal_entries_visited_at_idx";

CREATE INDEX "journal_entries_owner_id_visited_at_idx"
ON "journal_entries"("owner_id", "visited_at");

ALTER TABLE "journal_entries"
ADD CONSTRAINT "journal_entries_owner_id_fkey"
FOREIGN KEY ("owner_id")
REFERENCES "anonymous_users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
