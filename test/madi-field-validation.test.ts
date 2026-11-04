import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getMadiFieldErrors, prepareFirstJournalDraft } from "@/shared/api/firstJournal";
import { MadiFieldFeedback } from "@/features/tuti/components/MadiFieldFeedback";

const today = "2026-11-04";
const fields = { title: "", content: "산책한 하루", image: null, date: today, place: "" };

test("필드 검증은 빈 글·길이 초과·잘못된 날짜·미래 날짜의 이유를 구분한다", () => {
  assert.deepEqual(getMadiFieldErrors(fields, today), {});
  assert.match(getMadiFieldErrors({ ...fields, content: " " }, today).content!, /사진 없이/);
  assert.deepEqual(getMadiFieldErrors({ ...fields, image: "photo", content: "" }, today), {});
  assert.match(getMadiFieldErrors({ ...fields, title: "가".repeat(81) }, today).title!, /80자/);
  assert.match(getMadiFieldErrors({ ...fields, content: "가".repeat(4001) }, today).content!, /4000자/);
  assert.match(getMadiFieldErrors({ ...fields, place: "가".repeat(121) }, today).place!, /120자/);
  for (const date of ["", "2026-02-30", "2026-13-01", "not-a-date", "2026-1-1"]) {
    assert.match(getMadiFieldErrors({ ...fields, date }, today).date!, /올바른 날짜/);
    assert.equal(prepareFirstJournalDraft({ ...fields, date }, today), null);
  }
  assert.match(getMadiFieldErrors({ ...fields, date: "2026-11-05" }, today).date!, /오늘 또는 지난/);
  assert.deepEqual(getMadiFieldErrors({ ...fields, date: "2024-02-29" }, today), {});
  assert.deepEqual(getMadiFieldErrors({ ...fields, title: "가".repeat(80), content: "가".repeat(4000), place: "가".repeat(120) }, today), {});
});

test("기존 제목·장소만 남긴 마디 수정은 허용하고 새 작성의 사진·이야기 조건은 유지한다", () => {
  for (const extra of [{ title: "제목만" }, { place: "장소만" }]) {
    const value = { ...fields, content: "", ...extra };
    assert.deepEqual(getMadiFieldErrors(value, today, true), {});
    assert.ok(getMadiFieldErrors(value, today).content);
    assert.equal(prepareFirstJournalDraft(value, today), null);
  }
  assert.ok(getMadiFieldErrors({ ...fields, content: "" }, today, true).content);
});

test("처음의 빈 필드는 중립 안내로 표시하고 접근성 설명과 수정 제약·재시도를 연결한다", () => {
  for (const touched of [false, true]) {
    const html = renderToStaticMarkup(createElement(MadiFieldFeedback, { id: "field-feedback", message: "이야기를 적어주세요.", touched }));
    assert.match(html, /id="field-feedback"/);
    assert.match(html, /role="status"/);
    assert.match(html, touched ? /color:var\(--color-danger/ : /color:var\(--color-text-muted/);
  }
  for (const name of ["MadiCreateScreen", "JournalEditorScreen"]) {
    const source = readFileSync(`src/features/tuti/screens/journal/${name}.tsx`, "utf8");
    assert.match(source, /getMadiFieldErrors/);
    assert.match(source, /aria-invalid=\{Boolean\(touched.content && fieldErrors.content\)\}/);
    assert.match(source, /aria-describedby=\{fieldErrors.content/);
    assert.match(source, /maxLength=\{FIRST_JOURNAL_TITLE_LIMIT\}/);
    assert.match(source, /maxLength=\{FIRST_JOURNAL_CONTENT_LIMIT\}/);
  }
  const editor = readFileSync("src/features/tuti/screens/journal/JournalEditorScreen.tsx", "utf8");
  assert.match(editor, /onClick=\{retryPolicy\}>보호 설정 다시 확인하기/);
  assert.match(editor, /\}, \[policyAttempt\]\)/);
  assert.match(editor, /!canSubmit \|\| !sensitiveReady \|\| isSubmitting/);
  assert.match(editor, /const retryPolicy = \(\) => \{\s*setPolicyError\(null\); setSensitivePolicy\(null\); setPolicyAttempt/);
});
