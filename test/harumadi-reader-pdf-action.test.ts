import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { readFileSync } from "node:fs";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import { HARUMADI_READING_LAYOUT } from "@/shared/harumadi/readingTypography";

test("마지막 쪽 상태만 하단에 전달하고 지면 아래에는 추가 저장 행동을 만들지 않는다", () => {
  const fixture = harumadiContent();
  let ending = false;
  let extraPage = false;
  const page = clientFlowHarness("src/features/tuti/components/HarumadiPageViewer.tsx", "HarumadiPageViewer", {
    "@emotion/styled": styled, "./buttons": { BaseButton: "button" }, "./ContextMenu": { ContextMenu: "menu" },
    "@/shared/harumadi/readerEditing": {}, "./HarumadiSheet": { HarumadiPageSheet: "sheet" }, "./HarumadiByline": { HarumadiByline: "byline" },
    "@/shared/harumadi/readerPages": { buildHarumadiReaderPages: () => [{ kind: "cover" }, { kind: "entry" }, ...(extraPage ? [{ kind: "entry" }] : []), { kind: "back" }], harumadiPageAuthor: () => null },
    "@/shared/harumadi/readingTypography": { HARUMADI_READING_LAYOUT }, "@/shared/tuti/welcomeHarumadi": {},
    "@/shared/harumadi/readerText": { readerGroupGeometry: () => ({ pageWidth: 320, stageHeight: 450, minimumHeight: 600 }) },
    "@/lib/harumadiReadingPosition": { readingPosition: () => null },
  }, { window: { matchMedia: () => ({ matches: true }) }, document: { createElement: () => ({ getContext: () => null }) } });
  const props = { book: fixture.harumadi, entries: fixture.entries, onClose() {}, onEndChange(value: boolean) { ending = value; } };
  const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
  const render = (changes = {}) => { const tree = nodes(page.render({ ...props, ...changes })); page.effects(); return tree; };
  const action = (label: string, changes = {}) => render(changes).find(node => node.props.children === label);
  render(); assert.equal(ending, false);
  (action("다음 쪽")!.props.onClick as () => void)();
  assert.ok(action("덮기"));
  assert.equal(ending, true);
  extraPage = true;
  assert.ok(action("덮기"), "행동 영역 높이로 지면이 재분할돼도 마지막 쪽을 유지한다");
  assert.equal(action("PDF로 저장하기"), undefined);
  assert.equal(action("실물로 소장하기"), undefined);
  render({ entries: [] }); assert.equal(ending, false);
  render(); assert.equal(ending, true);
  (action("이전 쪽")!.props.onClick as () => void)();
  render(); assert.equal(ending, false, "이전 쪽으로 가면 기본 하단 행동으로 복귀한다");
  page.dispose();
});

test("마지막 쪽·관리 메뉴·함께 채우기는 같은 PDF 준비 경로와 잠금을 사용한다", () => {
  const source = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(source, /const openPdf = \(\) => \{\s*if \(busy \|\| readOnly \|\| !harumadi \|\| !chosen.length\) return;/);
  assert.match(source, /setError\(""\); setConfirmed\(false\); setPdf\(null\); setMode\("pdf"\)/);
  assert.match(source, /if \(action === "pdf"\) \{ openPdf\(\); return; \}/);
  assert.match(source, /onKeep=\{openPdf\}/);
  assert.match(source, /readerEnding && !readOnly \? <PdfSaveButton type="button" disabled=\{busy \|\| closing \|\| opening\} onClick=\{openPdf\}/);
  assert.match(source, /onEndChange=\{setReaderEnding\}/);
  assert.match(source, /label: "실물로 소장하기", onSelect: openPurchase/);
  assert.doesNotMatch(source, /pdfAction=|keepsakeAction=/);
});
