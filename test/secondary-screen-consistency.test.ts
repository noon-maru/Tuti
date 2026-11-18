import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("저장한 PDF는 사본 삭제를 명시하고 관리만 접으며 저장·공유 경로를 유지한다", () => {
  const source = readFileSync("src/features/tuti/flows/HarumadiPdfFlow.tsx", "utf8");
  const viewer = source.slice(source.indexOf("export function StoredHarumadiPdfViewer"), source.indexOf("function formatHarumadiDate"));
  assert.match(viewer, /저장한 PDF 목록으로 돌아가기/);
  assert.match(viewer, /<h1>저장한 PDF<\/h1>/);
  assert.match(viewer, /<StoredManagement>\s*<summary>PDF 관리<\/summary>/);
  assert.match(viewer, /PDF 사본을 삭제할까요/);
  assert.match(viewer, /원본 하루마디와 마디는 남지만/);
  assert.doesNotMatch(viewer, /하루마디 삭제|<SaveStatus/);
  assert.match(viewer, /await deleteHarumadiPdf\(harumadiPdf.id\)/);
  assert.match(viewer, /exportHarumadiPdf\(pdf.bytes, harumadiPdf.title\)/);
  assert.match(viewer, /<HarumadiPdfPreview/);
  assert.match(viewer, /surface="completed_harumadi" disabled=\{busy !== null\}/);
  assert.match(viewer, /disabled=\{!pdf \|\| busy !== null\}/);
});
