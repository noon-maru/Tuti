import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { harumadiEditsDirty } from "@/shared/harumadi/editState";
import { harumadiContent } from "./fixtures/harumadiContent";

test("설정·순서·담기 변경만 감지하고 선택 순서나 이전 미리보기 상태는 변경으로 보지 않는다", () => {
  const book = { ...harumadiContent().harumadi, entryIds: ["a", "b"] };
  const dirty = (mode: string, settings = book, selected = book.entryIds, ordered = book.entryIds) => harumadiEditsDirty(book, mode, settings, selected, ordered);
  assert.equal(dirty("settings"), false);
  assert.equal(dirty("settings", { ...book, title: "바뀐 이름" }), true);
  assert.equal(dirty("settings", { ...book, backCoverText: "" }), true);
  assert.equal(dirty("selection", book, ["b", "a"]), false);
  assert.equal(dirty("selection", book, ["a"]), true);
  assert.equal(dirty("order", book, book.entryIds, ["b", "a"]), true);
  assert.equal(dirty("pages", { ...book, title: "잔여 상태" }), false);
  assert.equal(harumadiEditsDirty({ ...book, shared: true }, "selection", book, ["a"], [], ["a"]), false);
  assert.equal(harumadiEditsDirty({ ...book, shared: true }, "selection", book, [], [], ["a"]), true);
  assert.equal(harumadiEditsDirty(undefined, "settings", { title: "우리의 작은 하루", coverStyle: "white-plain" }, [], []), false);
  assert.equal(harumadiEditsDirty(undefined, "settings", { title: "새 이름", coverStyle: "white-plain" }, [], []), true);
});

test("뒤로가기·브라우저 책 닫기·새로고침은 미저장 및 저장 중 보호를 연결한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /void allowLeave\(\).then\(allowed =>/);
  assert.match(flow, /registerCloseGuard\?\.\(dirty \|\| busy \? allowLeave : null\)/);
  assert.match(flow, /cancelLabel: "계속 편집"/);
  assert.match(flow, /confirmLabel: "변경사항 버리기"/);
  assert.match(flow, /window.addEventListener\("beforeunload", protect\)/);
  assert.match(flow, /window.removeEventListener\("beforeunload", protect\)/);
});
