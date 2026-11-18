import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { readFileSync } from "node:fs";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import { HARUMADI_READING_LAYOUT } from "@/shared/harumadi/readingTypography";

test("PDF 저장 행동은 마지막 쪽에서만 나타나고 빈 책·닫기 중에는 보이지 않는다", () => {
  const fixture = harumadiContent();
  let opened = 0;
  let extraPage = false;
  const page = clientFlowHarness("src/features/tuti/components/HarumadiPageViewer.tsx", "HarumadiPageViewer", {
    "@emotion/styled": styled, "./buttons": { BaseButton: "button" }, "./ContextMenu": { ContextMenu: "menu" },
    "@/shared/harumadi/readerEditing": {}, "./HarumadiSheet": { HarumadiPageSheet: "sheet" }, "./HarumadiByline": { HarumadiByline: "byline" },
    "@/shared/harumadi/readerPages": { buildHarumadiReaderPages: () => [{ kind: "cover" }, { kind: "entry" }, ...(extraPage ? [{ kind: "entry" }] : []), { kind: "back" }], harumadiPageAuthor: () => null },
    "@/shared/harumadi/readingTypography": { HARUMADI_READING_LAYOUT }, "@/shared/tuti/welcomeHarumadi": {},
    "@/shared/harumadi/readerText": { readerGroupGeometry: () => ({ pageWidth: 320, stageHeight: 450, minimumHeight: 600 }) },
    "@/lib/harumadiReadingPosition": { readingPosition: () => null },
  }, { window: { matchMedia: () => ({ matches: true }) } });
  const props = { book: fixture.harumadi, entries: fixture.entries, onClose() {}, pdfAction: createElement("button", { onClick: () => { opened++; } }, "PDF로 저장하기"), keepsakeAction: createElement("button", null, "실물로 소장하기") };
  const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
  const render = (changes = {}) => nodes(page.render({ ...props, ...changes }));
  const action = (label: string, changes = {}) => render(changes).find(node => node.props.children === label);
  assert.equal(action("PDF로 저장하기"), undefined);
  (action("다음 쪽")!.props.onClick as () => void)();
  assert.ok(action("덮기"));
  extraPage = true;
  assert.ok(action("덮기"), "행동 영역 높이로 지면이 재분할돼도 마지막 쪽을 유지한다");
  assert.ok(action("PDF로 저장하기"));
  assert.ok(action("실물로 소장하기"));
  (action("PDF로 저장하기")!.props.onClick as () => void)(); assert.equal(opened, 1);
  assert.equal(action("PDF로 저장하기", { entries: [] }), undefined);
  assert.equal(action("PDF로 저장하기", { closing: true }), undefined);
  assert.equal(action("PDF로 저장하기", { pdfAction: undefined }), undefined);
  assert.ok(action("실물로 소장하기", { pdfAction: undefined }));
  (action("이전 쪽")!.props.onClick as () => void)();
  assert.equal(action("PDF로 저장하기"), undefined);
  page.dispose();
});

test("마지막 쪽·관리 메뉴·함께 채우기는 같은 PDF 준비 경로와 잠금을 사용한다", () => {
  const source = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(source, /const openPdf = \(\) => \{\s*if \(busy \|\| readOnly \|\| !harumadi \|\| !chosen.length\) return;/);
  assert.match(source, /setError\(""\); setConfirmed\(false\); setPdf\(null\); setMode\("pdf"\)/);
  assert.match(source, /if \(action === "pdf"\) \{ openPdf\(\); return; \}/);
  assert.match(source, /onKeep=\{openPdf\}/);
  assert.match(source, /pdfAction=\{!readOnly \? <PdfSaveButton type="button" disabled=\{busy\} onClick=\{openPdf\}/);
});
