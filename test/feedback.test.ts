import assert from "node:assert/strict";
import test from "node:test";
import { createFeedbackController } from "@/lib/feedback";
import { readFileSync } from "node:fs";

test("확인 호스트가 없으면 작업을 허용하지 않고 명시적인 한 번의 응답만 전달한다", async () => {
  const ui = createFeedbackController();
  assert.equal(await ui.confirm("delete"), false);
  ui.attach(() => "owner-a:/madi");
  const answer = ui.confirm("delete", { title: "삭제", tone: "danger" });
  const id = ui.getSnapshot().confirmation!.id;
  assert.equal(await ui.confirm("another destructive action"), false);
  ui.answer(id + 1, true);
  assert.equal(ui.getSnapshot().confirmation!.id, id);
  ui.answer(id, true); ui.answer(id, false);
  assert.equal(await answer, true);
  assert.equal(ui.getSnapshot().confirmation, null);
});

test("계정·경로가 바뀐 늦은 확인과 호스트 해제·뒤로가기는 모두 취소한다", async () => {
  const ui = createFeedbackController();
  let scope = "owner-a:/madi?entryId=a";
  const detach = ui.attach(() => scope);
  const old = ui.confirm("old entry");
  scope = "owner-a:/madi?entryId=b";
  ui.answer(ui.getSnapshot().confirmation!.id, true);
  assert.equal(await old, false);
  const switched = ui.confirm("old owner");
  scope = "owner-b:/madi?entryId=b";
  ui.answer(ui.getSnapshot().confirmation!.id, true);
  assert.equal(await switched, false);
  const back = ui.confirm("back"); ui.cancelConfirmation(); assert.equal(await back, false);
  const unmount = ui.confirm("unmount"); detach(); assert.equal(await unmount, false);
});

test("토스트는 메모리의 최신 한 건만 유지하고 이전 타이머와 계정 초기화에 안전하다", () => {
  const ui = createFeedbackController();
  ui.attach(() => "owner-a");
  ui.notify("copied"); const old = ui.getSnapshot().toast!.id;
  ui.notify("failed", "error"); const current = ui.getSnapshot().toast!;
  assert.equal(current.tone, "error");
  ui.dismissToast(old); assert.equal(ui.getSnapshot().toast!.id, current.id);
  ui.reset(); assert.equal(ui.getSnapshot().toast, null);
  assert.deepEqual(ui.getServerSnapshot(), { confirmation: null, toast: null });
});

test("공통 호스트는 전체 경로에 한 번 연결하며 경로·계정 변화와 알림 접근성을 처리한다", () => {
  const root = readFileSync("src/app/layout.tsx", "utf8");
  const host = readFileSync("src/shared/ui/FeedbackHost.tsx", "utf8");
  assert.match(root, /<Suspense fallback=\{null\}><FeedbackHost \/><\/Suspense>/);
  assert.match(host, /subscribeToSession/);
  assert.match(host, /\[pathname, search\]/);
  assert.match(host, /window.addEventListener\("popstate", cancel\)/);
  assert.match(host, /notice.tone === "error" \? "alert" : "status"/);
  assert.match(host, /알림 닫기/);
  assert.match(host, /viewport \?\? document.body/);
});
