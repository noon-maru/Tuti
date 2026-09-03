ALTER TABLE "journal_entries"
ADD COLUMN "publication_consent_version" TEXT,
ADD COLUMN "publication_consented_at" TIMESTAMP(3);

UPDATE "journal_entries"
SET
  "publication_consent_version" = 'legacy-pre-consent',
  "publication_consented_at" = COALESCE("published_at", "publication_status_changed_at")
WHERE "publication_status" <> 'private';

ALTER TABLE "journal_entries"
DROP CONSTRAINT IF EXISTS "journal_entries_publication_state_check";

ALTER TABLE "journal_entries"
ADD CONSTRAINT "journal_entries_publication_state_check"
CHECK (
  (
    "publication_status" = 'private'
    AND "public_id" IS NULL
    AND "published_at" IS NULL
  )
  OR
  (
    "publication_status" = 'pending'
    AND "public_id" IS NOT NULL
    AND "published_at" IS NULL
    AND "publication_consent_version" IS NOT NULL
    AND "publication_consented_at" IS NOT NULL
  )
  OR
  (
    "publication_status" = 'published'
    AND "public_id" IS NOT NULL
    AND "published_at" IS NOT NULL
    AND "publication_consent_version" IS NOT NULL
    AND "publication_consented_at" IS NOT NULL
  )
  OR
  (
    "publication_status" = 'hidden'
    AND "public_id" IS NOT NULL
    AND "publication_consent_version" IS NOT NULL
    AND "publication_consented_at" IS NOT NULL
  )
);
