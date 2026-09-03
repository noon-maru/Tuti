UPDATE "journal_entries"
SET
  "publication_status" = 'published',
  "published_at" = COALESCE("published_at", CURRENT_TIMESTAMP),
  "publication_status_changed_at" = CURRENT_TIMESTAMP,
  "publication_review_reasons" = NULL,
  "publication_reviewed_at" = NULL,
  "publication_reviewer_user_id" = NULL
WHERE
  "publication_status" = 'pending'
  AND "publication_consent_version" = 'journal-publication-2026-10-01'
  AND "publication_consented_at" IS NOT NULL;

UPDATE "journal_entries"
SET
  "publication_status" = 'private',
  "public_id" = NULL,
  "published_at" = NULL,
  "publication_status_changed_at" = CURRENT_TIMESTAMP,
  "publication_review_reasons" = NULL,
  "publication_reviewed_at" = NULL,
  "publication_reviewer_user_id" = NULL,
  "publication_consent_version" = NULL,
  "publication_consented_at" = NULL
WHERE "publication_status" = 'pending';
