import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readerManagementActions } from "@/shared/harumadi/readerActions";

test("책 관리는 소유자·참여자 권한과 마디 수에 맞는 작업만 제공한다", () => {
  assert.deepEqual(readerManagementActions("owner", 2).map(item => item.action), ["settings", "selection", "order", "pdf"]);
  assert.deepEqual(readerManagementActions("contributor", 2).map(item => item.action), ["selection", "pdf"]);
  assert.deepEqual(readerManagementActions("owner", 0).map(item => item.action), ["settings", "selection"]);
  assert.deepEqual(readerManagementActions("owner", 1).map(item => item.action), ["settings", "selection", "pdf"]);
});

test("읽기에는 작성·함께 채우기를 남기고 관리 메뉴와 댓글은 독립적으로 접근한다", () => {
  const source = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const tools = source.slice(source.indexOf('<ReaderTools aria-label="하루마디 채우기">'), source.indexOf("</ReaderTools>"));
  assert.match(tools, /<WriteButton/); assert.match(tools, /<TogetherEntry/);
  assert.doesNotMatch(tools, /setMode\("order"\)|setMode\("pdf"\)|selectRecords/);
  assert.match(source, /<ReaderMenu label="하루마디 관리" disabled=\{busy \|\| readOnly\}/);
  assert.match(source, /harumadi.shared && <Quiet[^>]*onClick=\{\(\) => setMode\("comments"\)\}/);
  assert.match(source, /if \(busy \|\| readOnly\) return/);
  assert.match(source, /readerManagementActions\(harumadi.role, chosen.length\)/);
  assert.match(source, /var\(--screen-padding-right\)/);
  assert.doesNotMatch(source, /<Eyebrow|const Eyebrow/);
  const menu = readFileSync("src/features/tuti/components/ContextMenu.tsx", "utf8");
  assert.match(menu, /disabled=\{disabled\}/); assert.match(menu, /open && !disabled/);
});
