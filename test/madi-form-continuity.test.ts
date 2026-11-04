import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JournalEditorScreen } from "@/features/tuti/screens/journal/JournalEditorScreen";
import { MADI_FIELD_COPY } from "@/shared/tuti/madiFields";
import { harumadiContent } from "./fixtures/harumadiContent";

test("수정도 제목·이야기·날짜·장소 순서로 표시하고 글 마디의 사진 추가는 작은 조작부로 제공한다", () => {
  const entry = { ...harumadiContent().entries[0], image: null };
  const html = renderToStaticMarkup(createElement(JournalEditorScreen, { entry, onBack() {}, onSubmit() {} }));
  const title = html.indexOf('aria-label="마디 제목 (선택)"'), body = html.indexOf('aria-label="기억하고 싶은 이야기"');
  const date = html.indexOf('aria-label="마디 날짜"'), place = html.indexOf('aria-haspopup="dialog"');
  assert.ok(title >= 0 && title < body && body < date && date < place);
  assert.match(html, /사진 추가하기/); assert.match(html, /min-height:56px/);
  assert.match(html, /background-size:contain/);
  assert.match(html, /min-inline-size:0/); assert.match(html, /outline-offset:-2px/);
  assert.match(html, new RegExp(MADI_FIELD_COPY.titlePlaceholder));
  assert.match(html, new RegExp(MADI_FIELD_COPY.storyPlaceholder));
  assert.doesNotMatch(html, /지난 공간|어디에서 함께했나요|함께여서 좋았던/);
});

test("작성·수정은 같은 필드 이름·문구·날짜 너비 규칙을 공유하되 초안과 수정 버전 보호는 유지한다", () => {
  const create = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  const edit = readFileSync("src/features/tuti/screens/journal/JournalEditorScreen.tsx", "utf8");
  for (const source of [create, edit]) {
    assert.match(source, /<MadiFieldLabel>제목 <small>선택/);
    assert.match(source, /MADI_FIELD_COPY.titlePlaceholder/);
    assert.match(source, /MADI_FIELD_COPY.storyPlaceholder/);
    assert.match(source, /\$\{nativeDateInputStyles\}/);
    assert.match(source, /useMadiDraft/);
  }
  assert.match(edit, /const \[editVersion\] = useState\(entry\?\.version\)/);
  assert.match(edit, /expectedVersion: editVersion/);
  assert.match(create, /FIRST_JOURNAL_CONTENT_LIMIT/);
  assert.match(edit, /sensitiveJournalConsentNotice.items/);
});
