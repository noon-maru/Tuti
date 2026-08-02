ALTER TABLE "journal_entries"
ALTER COLUMN "theme" SET DEFAULT '미정';

UPDATE "journal_entries"
SET "theme" = '미정'
WHERE "theme" = '걷기 좋은';
