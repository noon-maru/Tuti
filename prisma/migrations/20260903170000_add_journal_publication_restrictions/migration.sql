ALTER TABLE "users"
ADD COLUMN "journal_publication_restricted_at" TIMESTAMP(3),
ADD COLUMN "journal_publication_restriction_reason" TEXT,
ADD COLUMN "journal_publication_restricted_by_user_id" TEXT;

CREATE INDEX "users_journal_publication_restricted_at_idx"
ON "users"("journal_publication_restricted_at");
