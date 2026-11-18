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

test("설정 하위 화면은 공통 제목·여백·버튼을 사용하고 알림 시간과 철회 기능을 유지한다", () => {
  const notification = readFileSync("src/features/tuti/screens/notifications/NotificationSettingsScreen.tsx", "utf8");
  const location = readFileSync("src/features/tuti/screens/location/LocationSettingsScreen.tsx", "utf8");
  for (const source of [notification, location]) {
    assert.match(source, /\$\{screenTitleStyles\}/);
    assert.match(source, /var\(--screen-padding-right\)/);
    assert.match(source, /var\(--screen-padding-bottom\)/);
  }
  const card = notification.match(/const Card = styled.section`([^`]+)`/)![1];
  assert.doesNotMatch(card, /border-radius|border:|background:/);
  assert.match(notification, /settings.reminderTime/);
  assert.match(notification, /type="time"/);
  assert.match(notification, /오늘 마디를 남겼다면 알려드리지 않아요/);
  const enable = location.match(/const EnableButton = styled\(PrimaryButton\)`([^`]+)`/)![1];
  assert.doesNotMatch(enable, /background|color:/);
  for (const control of ["위치 사용 잠시 멈추기", "위치정보 이용 동의 철회", "LocationHistorySection", "getLocationTerms"]) assert.ok(location.includes(control));
});

test("문의와 마디 수정은 공통 입력과 제목을 쓰고 기존 제출·수정 보호를 유지한다", () => {
  const inquiry = readFileSync("src/features/tuti/screens/inquiry/InquiryScreen.tsx", "utf8");
  const editor = readFileSync("src/features/tuti/screens/journal/JournalEditorScreen.tsx", "utf8");
  for (const source of [inquiry, editor]) {
    assert.match(source, /\$\{inputControlStyles\}/);
    assert.match(source, /\$\{screenTitleStyles\}/);
  }
  assert.doesNotMatch(inquiry, /box-shadow: 0 0 0 3px/);
  assert.match(inquiry, /aria-pressed=\{view === "write"\}/);
  assert.match(inquiry, /aria-pressed=\{view === "history"\}/);
  assert.match(inquiry, /disabled=\{!canSubmit \|\| submitting\}/);
  assert.match(editor, /const EditorCopy = styled.div`[\s\S]*?gap: 20px/);
});
