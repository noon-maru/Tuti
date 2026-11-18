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

test("담기 화면 검색은 헤더에서만 펼치고 닫기·키보드 복귀와 저장 보호를 유지한다", () => {
  const source = readFileSync("src/features/tuti/screens/journal/MadiHarumadiSelection.tsx", "utf8");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /searchOpen && <SearchOverlay>/);
  assert.match(source, /<HeaderControls inert=\{searchOpen\}/);
  assert.match(source, /event.key === "Escape"/);
  assert.match(source, /searchTrigger.current\?\.focus\(\)/);
  assert.doesNotMatch(source, /--screen-padding-top:/);
  assert.match(source, /지금은 담지 않기/);
  assert.match(source, /if \(saving.current \|\| finished/);
  assert.match(source, /await addMadiToHarumadi\(ownerId, selected, entryId/);
});

test("초대는 실제 초대한 사람과 책을 먼저 보여주고 참여 전 공유 범위를 명시한다", () => {
  const source = readFileSync("src/features/tuti/flows/HarumadiInviteFlow.tsx", "utf8");
  assert.ok(source.indexOf("{preview.data.inviterName}님이 초대했어요.") < source.indexOf("<ScopeNotice>"));
  assert.match(source, /<h2>\{preview.data.title\}<\/h2>/);
  assert.match(source, /현재·앞으로 참여하는 사람들에게 보여요/);
  assert.match(source, /내 계정의 원본과 이미 저장한 PDF는 남아요/);
  assert.match(source, /<summary>다른 방법으로 참여하기<\/summary>/);
  assert.match(source, /다른 계정으로 참여하기/);
  assert.match(source, /로그인하고 함께 채우기/);
  assert.match(source, /Boolean\(session.account && !preview.data\)/);
  assert.match(source, /changeTogether<\{ harumadiId: string \}>/);
});
