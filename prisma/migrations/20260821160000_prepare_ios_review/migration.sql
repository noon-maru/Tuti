-- 사용자별 외부 AI 프로필은 명시적 동의 기능을 도입할 때까지 제거한다.
DELETE FROM "user_signal_profiles";

-- 공개 웹 공유를 중단하면서 기존 링크도 다시 노출되지 않도록 폐기한다.
DELETE FROM "content_reports";

UPDATE "journal_entries"
SET
  "public_id" = NULL,
  "published_at" = NULL
WHERE "public_id" IS NOT NULL OR "published_at" IS NOT NULL;
