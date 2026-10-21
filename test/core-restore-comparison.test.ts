import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import test from "node:test";
import { compareCoreRestore } from "../src/server/legal/coreRestoreComparison";

const snapshot = (rows = 4, fingerprint = "a".repeat(32)) => ({
  retained: [{ table: "public.users", rows, fingerprint }, { table: "public.journal_entries", rows: 2, fingerprint: "b".repeat(32) }],
  omitted: [{ table: "public.related_tourism_source_records", rows: 500 }],
});
test("핵심 복원은 보존 테이블의 행 수·내용 지문 일치와 제외 테이블의 빈 상태를 요구한다", () => {
  const source = snapshot(); const restored = snapshot(); restored.omitted[0].rows = 0;
  const result = compareCoreRestore(source, restored, ["related_tourism_source_records"]);
  assert.equal(result.retainedTablesCompared, 2);
  assert.equal(result.retainedRowsCompared, 6);
  assert.equal(result.excludedTablesEmpty, 1);
  assert.equal(result.productionDatabaseTouched, false);
  assert.doesNotMatch(JSON.stringify(result), /public\.|aaaaaaaa|journal_entries/);
});
test("누락·행 손실·본문 변조·추가 데이터·정책 불일치를 거절한다", () => {
  const source = snapshot(); const empty = snapshot(); empty.omitted[0].rows = 0;
  const compare = (restored: ReturnType<typeof snapshot>) => compareCoreRestore(source, restored, ["related_tourism_source_records"]);
  const fewer = structuredClone(empty); fewer.retained.pop(); assert.throws(() => compare(fewer), /RETAINED_DATA_MISMATCH/);
  const changed = structuredClone(empty); changed.retained[0].fingerprint = "c".repeat(32); assert.throws(() => compare(changed), /RETAINED_DATA_MISMATCH/);
  const lost = structuredClone(empty); lost.retained[0].rows--; assert.throws(() => compare(lost), /RETAINED_DATA_MISMATCH/);
  assert.throws(() => compare(source), /EXCLUDED_DATA_PRESENT/);
  assert.throws(() => compareCoreRestore(source, empty, ["users"]), /POLICY_MISMATCH/);
  const duplicates = structuredClone(empty); duplicates.retained.push(duplicates.retained[0]); assert.throws(() => compare(duplicates), /SNAPSHOT_INVALID/);
});
test("격리 PDF 시험의 합성 파일은 실제 PDF 해독기로 두 페이지를 읽을 수 있다", async () => {
  const document = await PDFDocument.create(); document.addPage([420, 595]); document.addPage([420, 595]);
  const bytes = await document.save();
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
});
