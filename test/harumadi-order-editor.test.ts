import assert from "node:assert/strict";
import test from "node:test";
import { readerManagementActions } from "@/shared/harumadi/readerActions";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { HarumadiOrderEditor } from "../src/features/tuti/components/HarumadiOrderEditor";
import { harumadiContent } from "./fixtures/harumadiContent";
import { requiresServiceTerms } from "../src/shared/legal/serviceTerms";

test("순서 편집은 현재 순서·썸네일·날짜와 경계별 비활성 버튼을 표시한다", () => {
  const entry = harumadiContent().entries[0];
  const html = renderToStaticMarkup(createElement(HarumadiOrderEditor, {
    entries: [{ ...entry, id: "a", title: "먼저 쓴 마디" }, { ...entry, id: "b", title: "먼저 읽을 마디" }],
    ids: ["b", "a"], onChange: () => {}, disabled: false, scrollRef: { current: null },
  }));
  assert.ok(html.indexOf('data-order-entry="b"') < html.indexOf('data-order-entry="a"'));
  assert.match(html, /disabled="" aria-label="1번째 마디 위로 이동"/);
  assert.match(html, /disabled="" aria-label="2번째 마디 아래로 이동"/);
  assert.match(html, /role="status"/);
  // next/image의 서버 번들 변환은 Actions 빌드에서 검증한다. Node SSR은 글 마디로 검사한다.
  const editor = readFileSync("src/features/tuti/components/HarumadiOrderEditor.tsx", "utf8");
  assert.match(editor, /<Image src=\{entry.image\} alt="" fill unoptimized/);
  assert.match(html, /touch-action:none/);
  assert.match(html, /오른쪽 손잡이를 위아래로/);
  assert.match(html, /grid-template-columns:68px minmax\(0, 1fr\) 36px/);
  assert.match(html, /overflow-anchor:none/);
  assert.match(html, /-webkit-line-clamp:2/);
  assert.match(html, /grid-template-rows:28px 40px 28px/);
  assert.match(html, /place-items:center/);
  assert.match(html, /svg\{display:block/);
  assert.equal(requiresServiceTerms("/api/harumadis/book/order", "PATCH"), true);
});

test("읽기 화면은 소유자·온라인 상태에서 순서 편집을 열고 지정 순서를 재정렬하지 않는다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.equal(readerManagementActions("owner", 2).some(item => item.action === "order"), true);
  assert.equal(readerManagementActions("contributor", 2).some(item => item.action === "order"), false);
  assert.match(flow, /<ReaderMenu label="하루마디 관리" disabled=\{busy \|\| readOnly\}/);
  assert.match(flow, /if \(!harumadi \|\| harumadi.role === "contributor" \|\| readOnly \|\| busy\) return/);
  assert.match(flow, /if \(action === "order"\) setOrderedIds\(harumadi.entryIds\)/);
  assert.match(flow, /revision: harumadi.revision, entryIds: orderedIds/);
  assert.match(flow, /const chosen = useMemo\(\(\) => orderByEntryIds/);
  assert.match(flow, /mode === "order" \? saveOrder\(\)/);
  assert.match(flow, /mode === "order" \? "이 순서로 저장하기"/);
  const editor = readFileSync("src/features/tuti/components/HarumadiOrderEditor.tsx", "utf8");
  assert.match(editor, /onPointerCancel=\{event => finish\(true, event.pointerId\)\}/);
  assert.match(editor, /onLostPointerCapture=\{event => finish\(true, event.pointerId\)\}/);
  assert.match(editor, /event.key === "ArrowUp"/);
  assert.match(editor, /const index = positionIds.indexOf\(entry.id\)/);
  const drag = readFileSync("src/features/tuti/hooks/useHarumadiOrderDrag.ts", "utf8");
  assert.match(drag, /list.setPointerCapture\(event.pointerId\)/);
  assert.match(drag, /node.style.transform = translation/);
  assert.match(drag, /node.animate\(/);
  assert.match(drag, /motionReduced\(\)/);
  assert.match(drag, /const changed = !cancelled/);
  assert.match(drag, /onChange\(active.previewIds\)/);
});
