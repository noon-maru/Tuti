-- 장소의 분류·혼잡도 정보는 유지하고, 사용자 마디의 세 분류 항목만 제거한다.
ALTER TABLE "journal_entries"
  DROP COLUMN "crowd",
  DROP COLUMN "theme",
  DROP COLUMN "difficulty";
