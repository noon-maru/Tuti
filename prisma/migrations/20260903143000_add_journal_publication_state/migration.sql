CREATE TYPE "JournalPublicationStatus" AS ENUM (
  'private',
  'pending',
  'published',
  'hidden'
);

ALTER TABLE "journal_entries"
ADD COLUMN "publication_status" "JournalPublicationStatus" NOT NULL DEFAULT 'private',
ADD COLUMN "publication_status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "journal_entries"
SET
  "publication_status" = 'published',
  "publication_status_changed_at" = COALESCE("published_at", "updated_at")
WHERE "public_id" IS NOT NULL
  AND "published_at" IS NOT NULL;

CREATE INDEX "journal_entries_publication_status_published_at_idx"
ON "journal_entries"("publication_status", "published_at");
