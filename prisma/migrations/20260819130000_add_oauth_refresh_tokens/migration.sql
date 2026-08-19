ALTER TABLE "auth_identities"
ADD COLUMN "provider_refresh_token_encrypted" TEXT;

ALTER TABLE "oauth_authorizations"
ADD COLUMN "provider_refresh_token_encrypted" TEXT;
