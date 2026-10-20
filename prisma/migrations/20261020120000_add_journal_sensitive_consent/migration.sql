ALTER TABLE "journal_entries"
  ADD COLUMN "sensitive_content" BOOLEAN,
  ADD COLUMN "sensitive_consent_version" TEXT,
  ADD COLUMN "sensitive_consented_at" TIMESTAMP(3),
  ADD COLUMN "sensitive_withdrawn_at" TIMESTAMP(3);
-- 기존 기록은 미분류(NULL)로 남긴다. 과거 이용을 새 동의로 간주하지 않는다.
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_sensitive_consent_shape" CHECK (
  ("sensitive_consent_version" IS NULL AND "sensitive_consented_at" IS NULL)
  OR ("sensitive_content" IS TRUE AND "sensitive_consent_version" IS NOT NULL AND "sensitive_consented_at" IS NOT NULL)
);
CREATE INDEX "journal_entries_sensitive_withdrawn_at_idx" ON "journal_entries" ("sensitive_withdrawn_at");
ALTER TABLE "journal_books" ADD COLUMN "sensitive_policy_version" TEXT;
