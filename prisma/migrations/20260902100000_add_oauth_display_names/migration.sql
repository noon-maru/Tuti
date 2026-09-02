ALTER TABLE "oauth_authorizations"
ADD COLUMN "provider_display_name" TEXT,
ADD COLUMN "collect_display_name" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
ADD COLUMN "display_name" TEXT;
