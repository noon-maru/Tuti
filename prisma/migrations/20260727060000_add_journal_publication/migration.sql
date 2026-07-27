ALTER TABLE "journal_entries"
ADD COLUMN "public_id" TEXT,
ADD COLUMN "published_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "journal_entries_public_id_key"
ON "journal_entries"("public_id");
