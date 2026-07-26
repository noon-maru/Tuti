ALTER TABLE "oauth_authorizations"
ADD COLUMN "provider_subject" TEXT,
ADD COLUMN "provider_email" TEXT,
ADD COLUMN "completion_token_hash" TEXT,
ADD COLUMN "completed_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "oauth_authorizations_completion_token_hash_key"
ON "oauth_authorizations"("completion_token_hash");
