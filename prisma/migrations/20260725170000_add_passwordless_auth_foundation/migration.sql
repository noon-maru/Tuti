CREATE TYPE "AuthProvider" AS ENUM ('email', 'apple', 'google', 'kakao');

CREATE TABLE "auth_identities" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "provider_subject" TEXT NOT NULL,
  "email" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verification_codes" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauth_authorizations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "state_hash" TEXT NOT NULL,
  "code_verifier" TEXT NOT NULL,
  "return_to" TEXT NOT NULL DEFAULT '/',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oauth_authorizations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "auth_identities" (
  "id",
  "user_id",
  "provider",
  "provider_subject",
  "email",
  "updated_at"
)
SELECT
  'email-' || "id",
  "id",
  'email'::"AuthProvider",
  LOWER("email"),
  LOWER("email"),
  CURRENT_TIMESTAMP
FROM "users"
WHERE "email" IS NOT NULL;

DROP INDEX IF EXISTS "users_email_key";

ALTER TABLE "users"
DROP COLUMN "email",
DROP COLUMN "password_hash";

CREATE UNIQUE INDEX "auth_identities_provider_provider_subject_key"
ON "auth_identities"("provider", "provider_subject");

CREATE INDEX "auth_identities_user_id_idx"
ON "auth_identities"("user_id");

CREATE INDEX "email_verification_codes_email_created_at_idx"
ON "email_verification_codes"("email", "created_at");

CREATE INDEX "email_verification_codes_expires_at_idx"
ON "email_verification_codes"("expires_at");

CREATE UNIQUE INDEX "oauth_authorizations_state_hash_key"
ON "oauth_authorizations"("state_hash");

CREATE INDEX "oauth_authorizations_user_id_idx"
ON "oauth_authorizations"("user_id");

CREATE INDEX "oauth_authorizations_expires_at_idx"
ON "oauth_authorizations"("expires_at");

ALTER TABLE "auth_identities"
ADD CONSTRAINT "auth_identities_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_authorizations"
ADD CONSTRAINT "oauth_authorizations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
