ALTER TABLE "journal_entries"
ADD CONSTRAINT "journal_entries_publication_state_check"
CHECK (
  (
    "publication_status" = 'private'
    AND "public_id" IS NULL
    AND "published_at" IS NULL
  )
  OR (
    "publication_status" = 'pending'
    AND "public_id" IS NOT NULL
    AND "published_at" IS NULL
  )
  OR (
    "publication_status" IN ('published', 'hidden')
    AND "public_id" IS NOT NULL
    AND "published_at" IS NOT NULL
  )
);
