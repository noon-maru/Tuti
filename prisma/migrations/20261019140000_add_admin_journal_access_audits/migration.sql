CREATE TABLE "admin_journal_access_audits" (
  "id" TEXT PRIMARY KEY,
  "actor_user_id" TEXT,
  "subject_user_id" TEXT,
  "purpose" TEXT,
  "case_reference" TEXT,
  "entry_ids" TEXT[] NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "admin_journal_access_audits_occurred_at_idx" ON "admin_journal_access_audits"("occurred_at");
CREATE INDEX "admin_journal_access_audits_actor_user_id_occurred_at_idx" ON "admin_journal_access_audits"("actor_user_id", "occurred_at");
CREATE INDEX "admin_journal_access_audits_subject_user_id_occurred_at_idx" ON "admin_journal_access_audits"("subject_user_id", "occurred_at");

-- 일반 로그를 삭제/변경하지 않고 이미 남은 접근 증거의 최소 항목만 별도 보존한다.
-- 과거에 없던 사유·처리 번호를 만들어 채우거나 본문·사진·임의 metadata를 복제하지 않는다.
INSERT INTO "admin_journal_access_audits" ("id", "actor_user_id", "subject_user_id", "purpose", "case_reference", "entry_ids", "occurred_at")
SELECT "id", "actor_user_id", CASE WHEN "target_type" = 'user' THEN "target_id" ELSE NULL END,
  "metadata"->>'purpose', "metadata"->>'reference',
  CASE WHEN NULLIF("metadata"->>'entryIds', '') IS NOT NULL THEN string_to_array("metadata"->>'entryIds', ',') ELSE ARRAY[]::TEXT[] END,
  "created_at"
FROM "system_logs" WHERE "category" = 'journal' AND "action" = 'journal.admin.viewed';

-- 롤백한 구버전 서버가 SystemLog만 기록해도 보존본을 남긴다.
CREATE FUNCTION "capture_admin_journal_access_audit"() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "admin_journal_access_audits" ("id", "actor_user_id", "subject_user_id", "purpose", "case_reference", "entry_ids", "occurred_at")
  VALUES (NEW.id, NEW.actor_user_id, CASE WHEN NEW.target_type = 'user' THEN NEW.target_id ELSE NULL END,
    NEW.metadata->>'purpose', NEW.metadata->>'reference',
    CASE WHEN NULLIF(NEW.metadata->>'entryIds', '') IS NOT NULL THEN string_to_array(NEW.metadata->>'entryIds', ',') ELSE ARRAY[]::TEXT[] END,
    NEW.created_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "capture_admin_journal_access_audit"
AFTER INSERT ON "system_logs"
FOR EACH ROW WHEN (NEW.category = 'journal' AND NEW.action = 'journal.admin.viewed')
EXECUTE FUNCTION "capture_admin_journal_access_audit"();

-- 기록 원문 접근은 민감정보 포함 가능성을 고려해 보수적으로 2년 보존한다.
-- 이 기간을 일반 사용자 이벤트나 전체 SystemLog에 적용하지 않는다.
CREATE FUNCTION "protect_admin_journal_access_audit"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Admin journal access audit is immutable';
  END IF;
  IF OLD.occurred_at + INTERVAL '2 years' >= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Admin journal access audit retention has not expired';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "admin_journal_access_audit_retention"
BEFORE UPDATE OR DELETE ON "admin_journal_access_audits"
FOR EACH ROW EXECUTE FUNCTION "protect_admin_journal_access_audit"();
CREATE TRIGGER "admin_journal_access_audit_no_truncate"
BEFORE TRUNCATE ON "admin_journal_access_audits"
FOR EACH STATEMENT EXECUTE FUNCTION "protect_admin_journal_access_audit"();
