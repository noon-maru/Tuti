CREATE TABLE legal_document_notices (
  document_type TEXT NOT NULL CHECK (document_type IN ('service-terms','privacy','location-terms','community-guidelines')),
  version TEXT NOT NULL,
  document JSONB NOT NULL,
  document_hash TEXT NOT NULL CHECK (document_hash ~ '^[a-f0-9]{64}$'),
  published_at TIMESTAMP(3) NOT NULL,
  planned_effective_at TIMESTAMP(3) NOT NULL,
  publication_mode TEXT NOT NULL CHECK (publication_mode IN ('initial','amendment')),
  approval_reference TEXT NOT NULL CHECK (approval_reference ~ '^[a-zA-Z0-9_-]{3,100}$'),
  application_policy TEXT NOT NULL CHECK (length(trim(application_policy)) BETWEEN 1 AND 2000),
  PRIMARY KEY (document_type,version),
  CONSTRAINT legal_document_notice_interval_check CHECK (
    planned_effective_at >= published_at + CASE WHEN publication_mode = 'amendment' THEN INTERVAL '30 days' ELSE INTERVAL '0 days' END
  )
);
CREATE INDEX legal_document_notices_type_published_idx ON legal_document_notices(document_type,published_at);
CREATE TRIGGER legal_document_notices_immutable BEFORE UPDATE OR DELETE ON legal_document_notices
  FOR EACH ROW EXECUTE FUNCTION reject_published_service_terms_change();
CREATE TRIGGER legal_document_notices_no_truncate BEFORE TRUNCATE ON legal_document_notices
  FOR EACH STATEMENT EXECUTE FUNCTION reject_published_service_terms_change();

-- 공고 이력만으로 시행·동의나 기존 계약 종료가 발생하지 않는다.
CREATE FUNCTION guard_legal_notice_insert() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(20261019, 1);
  IF NEW.document_type='service-terms' AND EXISTS (SELECT 1 FROM service_terms_releases WHERE version=NEW.version) THEN
    RAISE EXCEPTION 'Cannot announce an already activated service terms version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER legal_document_notice_insert_guard BEFORE INSERT ON legal_document_notices
  FOR EACH ROW EXECUTE FUNCTION guard_legal_notice_insert();
CREATE FUNCTION guard_service_terms_notice_activation() RETURNS TRIGGER AS $$
DECLARE notice legal_document_notices%ROWTYPE;
BEGIN
  SELECT * INTO notice FROM legal_document_notices WHERE document_type='service-terms' AND version=NEW.version;
  IF FOUND AND (NEW.document_hash IS DISTINCT FROM notice.document_hash
    OR NEW.document IS DISTINCT FROM notice.document OR NEW.published_at IS DISTINCT FROM notice.published_at
    OR NEW.publication_mode IS DISTINCT FROM notice.publication_mode OR NEW.effective_at < notice.planned_effective_at) THEN
    RAISE EXCEPTION 'Activation must match the announced document and cannot precede the announced date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER service_terms_notice_activation_guard BEFORE INSERT ON service_terms_releases
  FOR EACH ROW EXECUTE FUNCTION guard_service_terms_notice_activation();
