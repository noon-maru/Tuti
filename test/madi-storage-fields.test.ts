import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("마이그레이션은 마디의 세 분류 열만 제거하고 장소 모델은 유지한다", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const journal = schema.match(/model JournalEntry \{([\s\S]*?)\n\}/)?.[1];
  const place = schema.match(/model Place \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(journal); assert.ok(place);
  assert.doesNotMatch(journal, /\b(crowd|theme|difficulty)\s+String/);
  assert.match(journal, /title\s+String/);
  assert.match(place, /crowd\s+String/);
  const migration = readFileSync("prisma/migrations/20261027120000_remove_journal_classification/migration.sql", "utf8");
  assert.equal(migration.match(/ALTER TABLE/g)?.length, 1);
  assert.match(migration, /ALTER TABLE "journal_entries"/);
  assert.equal(migration.match(/DROP COLUMN/g)?.length, 3);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|ALTER TABLE "places"/);
});

test("마디의 작성·수정·상세·공개·공유·관리자 화면에서 세 분류를 없앤다", () => {
  for (const path of [
    "src/features/tuti/screens/journal/JournalEditorScreen.tsx",
    "src/features/tuti/screens/journal/JournalDetailScreen.tsx",
    "src/features/tuti/screens/journal/PublicJournalScreen.tsx",
    "src/features/tuti/components/JournalShareDialog.tsx",
    "src/features/admin/AdminUserJournalsPanel.tsx",
    "src/server/journal/service.ts", "src/server/journal/publication.ts",
  ]) assert.doesNotMatch(readFileSync(path, "utf8"), /(?:entry|input)\.(crowd|theme|difficulty)\b|(?:crowd|theme|difficulty): true/);
  const writer = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(writer, /마디 제목 \(선택\)/);
  assert.match(writer, /title=\{saved \? saved.title : title.trim\(\)\}/);
  assert.match(writer, /setTitle\(""\)/);
});
