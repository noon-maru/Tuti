import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MadiLoadNotice } from "@/features/tuti/components/MadiLoadNotice";
import { JournalEditorStatusScreen } from "@/features/tuti/screens/journal/JournalEditorScreen";

test("조회 실패는 빈 목록 안내와 다른 상태와 재시도 조작을 제공한다", () => {
  const html = renderToStaticMarkup(createElement(MadiLoadNotice, { onRetry() {} }));
  assert.match(html, /role="alert"/); assert.match(html, /마디를 불러오지 못했어요/);
  assert.match(html, /없어진 건 아니에요/); assert.match(html, /다시 불러오기/);
  assert.doesNotMatch(html, /첫 마디를 남겨보세요/);
  const busy = renderToStaticMarkup(createElement(MadiLoadNotice, { busy: true, compact: true, onRetry() {} }));
  assert.match(busy, /disabled=""/); assert.match(busy, /불러오는 중/);
  assert.doesNotMatch(busy, /없어진 건 아니에요/);
  const source = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.match(source, /isError && allEntries.length > 0 && <MadiLoadNotice compact/);
  assert.ok(source.indexOf(") : isError ? (") < source.indexOf("첫 마디를 남겨보세요"));
});

test("편집 조회 실패와 존재하지 않는 마디를 분리하고 실패에서 재시도한다", () => {
  const html = renderToStaticMarkup(createElement(JournalEditorStatusScreen, { message: "수정할 마디를 불러오지 못했어요.", onBack() {}, onRetry() {} }));
  assert.match(html, /다시 불러오기/); assert.match(html, /role="alert"/);
  const source = readFileSync("src/features/tuti/flows/JournalEditFlow.tsx", "utf8");
  assert.ok(source.indexOf("if (isError && !entry)") < source.indexOf("if (!entry)"));
  assert.match(source, /onRetry=\{\(\) => void refetch\(\)\}/);
});

test("마디 스택은 제스처를 유지하며 명시적 이전·다음·방향키와 선택 카드 포커스를 제공한다", () => {
  const source = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.match(source, /aria-label="마디 이동"/);
  assert.match(source, /onClick=\{\(\) => moveStack\(-1\)\}/);
  assert.match(source, /onClick=\{\(\) => moveStack\(1\)\}/);
  assert.equal(source.match(/disabled=\{entries.length < 2\}/g)?.length, 2);
  assert.match(source, /event.currentTarget.contains\(event.target as Node\)/);
  for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) assert.ok(source.includes(`"${key}"`));
  assert.match(source, /querySelector<HTMLButtonElement>\('\[aria-pressed="true"\]'\)\?\.focus/);
  assert.match(source, /onWheel=\{scrollStack\}/); assert.match(source, /onPointerMove=\{updateStackDrag\}/);
});
