import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { harumadiActions, initialHarumadiMode } from "@/features/tuti/navigation/harumadiActions";
import { harumadiContent } from "./fixtures/harumadiContent";

test("공동작성 시작과 참여자 관리는 책별 메뉴에서 바로 열고 참여자에게 소유자 설정은 보이지 않는다", () => {
  const book = { ...harumadiContent().harumadi, togetherEnabled: true, role: "owner" as const };
  assert.deepEqual(harumadiActions(book), [{ label: "함께 채우기 시작", mode: "together" }, { label: "하루마디 설정", mode: "settings" }]);
  assert.deepEqual(harumadiActions({ ...book, shared: true, role: "contributor" }), [{ label: "함께 채우기 관리", mode: "together" }]);
  assert.deepEqual(harumadiActions({ ...book, togetherEnabled: false }), [{ label: "하루마디 설정", mode: "settings" }]);
  assert.equal(initialHarumadiMode(book, "together"), "together");
  assert.equal(initialHarumadiMode(book), "pages");
  assert.equal(initialHarumadiMode({ ...book, role: "contributor" }, "settings"), "together");
  assert.equal(initialHarumadiMode({ ...book, togetherEnabled: false }, "together"), "pages");
});

test("책장은 점 세 개 메뉴에서만 공동작성을 열고 메뉴 선택만으로 초대하지 않는다", () => {
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  const shelf = readFileSync("src/features/tuti/components/HarumadiShelf.tsx", "utf8");
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const menu = readFileSync("src/features/tuti/components/ContextMenu.tsx", "utf8");
  assert.doesNotMatch(home, /TogetherAction|TogetherSlot/);
  assert.match(shelf, /items=\{harumadiActions\(book\)/);
  assert.match(shelf, /label: action.label, singleLine: true/);
  assert.match(menu, /\$singleLine \? "nowrap" : "pre-line"/);
  assert.match(shelf, /onSelect: trigger => onOpen\(book, trigger, action.mode\)/);
  assert.match(flow, /mode === "pages" && harumadi && <ReaderTools/);
  const readerTools = flow.slice(flow.indexOf('<ReaderTools aria-label="하루마디 채우기">'), flow.indexOf("</ReaderTools>"));
  assert.match(readerTools, /harumadi.togetherEnabled && <TogetherEntry/);
  assert.match(readerTools, /disabled=\{busy \|\| readOnly\} onClick=\{\(\) => setMode\("together"\)\}/);
  assert.doesNotMatch(flow, /함께 채우기 · 참여자 관리/);
  assert.match(flow, /mode === "together" && harumadi \? readOnly \?/);
  assert.doesNotMatch(home, /changeTogether|createInvite/);
  assert.match(menu, /void item.onSelect\(triggerRef.current\)/);
  assert.match(menu, /removeEventListener\(ANDROID_BACK_EVENT, closeOnAndroidBack, true\)/);
  assert.match(menu, /"ArrowDown", "ArrowUp", "Home", "End"/);
});
