-- 기존 공고는 amendment 기본값을 유지한다. 최초 계약만 별도 승인 근거를 요구한다.
ALTER TABLE service_terms_releases
  ADD COLUMN publication_mode TEXT NOT NULL DEFAULT 'amendment',
  ADD COLUMN initial_contract_reference TEXT;
ALTER TABLE service_terms_releases DROP CONSTRAINT service_terms_release_notice_check;
ALTER TABLE service_terms_releases ADD CONSTRAINT service_terms_release_notice_check CHECK (
  (publication_mode = 'amendment' AND initial_contract_reference IS NULL AND notice_days >= 30
    AND effective_at >= published_at + notice_days * INTERVAL '1 day') OR
  (publication_mode = 'initial' AND initial_contract_reference IS NOT NULL
    AND initial_contract_reference ~ '^[a-zA-Z0-9_-]{3,100}$'
    AND notice_days = 0 AND effective_at >= published_at)
);
CREATE UNIQUE INDEX service_terms_releases_single_initial
  ON service_terms_releases (publication_mode) WHERE publication_mode = 'initial';

CREATE FUNCTION guard_initial_service_terms_release() RETURNS TRIGGER AS $$
BEGIN
  -- CLI를 우회한 INSERT도 공고 잠금을 공유한다.
  PERFORM pg_advisory_xact_lock(20261019, 1);
  IF NEW.publication_mode = 'initial' THEN
    -- 계정 생성과 공고가 경합해 기존 일반 계정을 누락하지 않도록 한다.
    LOCK TABLE users IN SHARE MODE;
    IF EXISTS (SELECT 1 FROM service_terms_releases) THEN
      RAISE EXCEPTION 'Initial terms require an empty release history';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE role <> 'admin') THEN
      RAISE EXCEPTION 'Initial terms require closure of existing ordinary accounts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER service_terms_releases_initial_guard BEFORE INSERT ON service_terms_releases
  FOR EACH ROW EXECUTE FUNCTION guard_initial_service_terms_release();
-- 원문 UPDATE/DELETE 금지 트리거와 기존 동의 기록은 변경하지 않는다.
