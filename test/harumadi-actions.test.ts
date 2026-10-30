import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { harumadiActions, initialHarumadiMode } from "@/features/tuti/navigation/harumadiActions";
import { harumadiContent } from "./fixtures/harumadiContent";

test("공동작성 시작과 참여자 관리는 책별 메뉴에서 바로 열고 참여자에게 소유자 설정은 보이지 않는다", () => {
  const book = { ...harumadiContent().harumadi, togetherEnabled: true, role: "owner" as const };
  assert.deepEqual(harumadiActions(book), [{ label: "함께 채우기 시작", mode: "together" }, { label: "하루마디 설정", mode: "settings" }]);
  assert.deepEqual(harumadiActions({ ...book, shared: true, role: "contributor" }), [{ label: "함께 채우기 · 참여자 관리", mode: "together" }]);
  assert.deepEqual(harumadiActions({ ...book, togetherEnabled: false }), [{ label: "하루마디 설정", mode: "settings" }]);
  assert.equal(initialHarumadiMode(book, "together"), "together");
  assert.equal(initialHarumadiMode(book), "pages");
  assert.equal(initialHarumadiMode({ ...book, role: "contributor" }, "settings"), "together");
  assert.equal(initialHarumadiMode({ ...book, togetherEnabled: false }, "together"), "pages");
});

test("책장·책 읽기에 명시적인 공동작성 진입점을 두되 메뉴 선택만으로 초대하지 않는다", () => {
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const menu = readFileSync("src/features/tuti/components/ContextMenu.tsx", "utf8");
  assert.match(home, /harumadiPdf.togetherEnabled && <TogetherAction/);
  assert.match(home, /openBook\(harumadiPdf, event.currentTarget, "together"\)/);
  assert.match(flow, /harumadi\?\.togetherEnabled && mode === "pages" && <TogetherEntry/);
  assert.match(flow, /mode === "together" && harumadi \? readOnly \?/);
  assert.doesNotMatch(home, /changeTogether|createInvite/);
  assert.match(menu, /void item.onSelect\(triggerRef.current\)/);
  assert.match(menu, /removeEventListener\(ANDROID_BACK_EVENT, closeOnAndroidBack, true\)/);
  assert.match(menu, /"ArrowDown", "ArrowUp", "Home", "End"/);
});
