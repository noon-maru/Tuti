ALTER TABLE "journal_entries"
ADD COLUMN "publication_review_reasons" JSONB,
ADD COLUMN "publication_reviewed_at" TIMESTAMP(3),
ADD COLUMN "publication_reviewer_user_id" TEXT;
