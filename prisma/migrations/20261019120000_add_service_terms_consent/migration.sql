CREATE TABLE "service_terms_releases" (
  "version" TEXT NOT NULL PRIMARY KEY,
  "document" JSONB NOT NULL,
  "document_hash" TEXT NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "approval_reference" TEXT NOT NULL,
  "notice_days" INTEGER NOT NULL,
  CONSTRAINT "service_terms_release_notice_check" CHECK (
    "notice_days" >= 30 AND "effective_at" >= "published_at" + "notice_days" * INTERVAL '1 day'
  )
);
CREATE INDEX "service_terms_releases_effective_at_idx" ON "service_terms_releases"("effective_at");
-- 공고된 원문을 같은 버전으로 덮어쓰거나 삭제하지 않는다.
CREATE FUNCTION "reject_published_service_terms_change"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Published service terms are immutable; publish a new version';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "service_terms_releases_immutable"
BEFORE UPDATE OR DELETE ON "service_terms_releases"
FOR EACH ROW EXECUTE FUNCTION "reject_published_service_terms_change"();
CREATE TABLE "service_terms_acceptances" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "terms_version" TEXT NOT NULL REFERENCES "service_terms_releases"("version") ON DELETE RESTRICT ON UPDATE CASCADE,
  "document_hash" TEXT NOT NULL,
  "age_confirmed" BOOLEAN NOT NULL,
  "important_terms_confirmed" BOOLEAN NOT NULL,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_terms_acceptance_explicit_check" CHECK ("age_confirmed" AND "important_terms_confirmed")
);
CREATE UNIQUE INDEX "service_terms_acceptances_user_id_terms_version_key" ON "service_terms_acceptances"("user_id", "terms_version");
