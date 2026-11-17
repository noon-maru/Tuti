import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import styled from "@emotion/styled";
import { createJSONStorage } from "zustand/middleware";
import { handleDepartureReturn } from "@/lib/departureReturn";
import { useTutiStore, type PendingDeparture } from "@/store/tuti";
import { pendingMadiPath } from "@/shared/tuti/pendingMadi";
import type { RecommendationActionInput } from "@/shared/api/recommendationActions";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { findMadiControl } from "./fixtures/madiCreateHarness";

const now = Date.parse("2026-11-17T10:00:00Z");
const pending: PendingDeparture = {
  ownerId: "owner", harumadiId: "book", journeyId: "journey", placeId: "place", placeName: "함께 걷는 길",
  placeImage: "", placePhrase: "", routeMode: "walking",
  startedAt: new Date(now - 3600_000).toISOString(), promptAfter: new Date(now - 1000).toISOString(),
};
function fixture() {
  const actions: RecommendationActionInput[] = [], paths: string[] = [];
  let completed = 0, postponed = 0;
  return { actions, paths, completed: () => completed, postponed: () => postponed,
    effects: { record: (action: RecommendationActionInput) => actions.push(action), complete: () => { completed++; },
      postponeWriting: () => { postponed++; }, navigate: (path: string) => paths.push(path) } };
}

test("방문만 확인하면 작성 시작·이동 없이 방문 행동만 남긴다", () => {
  const f = fixture();
  assert.equal(handleDepartureReturn({ departure: pending, ownerId: "owner", writeNow: false, now }, f.effects), true);
  assert.deepEqual(f.actions.map(a => a.action), ["return_confirmed"]);
  assert.equal(f.postponed(), 1); assert.equal(f.completed(), 0); assert.deepEqual(f.paths, []);
});

test("명시적으로 마디 남기기를 고르면 방문·작성 시작과 원래 장소·책을 이어간다", () => {
  const f = fixture();
  handleDepartureReturn({ departure: pending, ownerId: "owner", writeNow: true, now }, f.effects);
  assert.deepEqual(f.actions.map(a => a.action), ["return_confirmed", "journal_started"]);
  assert.equal(f.completed(), 1); assert.equal(f.postponed(), 0);
  const url = new URL(f.paths[0], "https://tuti.test");
  assert.equal(url.pathname, "/madi/new");
  assert.equal(url.searchParams.get("placeId"), "place");
  assert.equal(url.searchParams.get("placeName"), "함께 걷는 길");
  assert.equal(url.searchParams.get("harumadiId"), "book");
  assert.equal(url.searchParams.get("journeyId"), "journey");
});

test("다른 계정·확인 완료·미도래·만료된 출발은 방문으로 집계하거나 작성하지 않는다", () => {
  for (const departure of [undefined, { ...pending, ownerId: "other" }, { ...pending, returnConfirmed: true },
    { ...pending, promptAfter: new Date(now + 1000).toISOString() },
    { ...pending, startedAt: new Date(now - 8 * 86400_000).toISOString() }]) {
    const f = fixture();
    assert.equal(handleDepartureReturn({ departure, ownerId: "owner", writeNow: true, now }, f.effects), false);
    assert.deepEqual(f.actions, []); assert.deepEqual(f.paths, []); assert.equal(f.completed(), 0); assert.equal(f.postponed(), 0);
  }
});

test("방문 확인은 계정별 이어쓰기 맥락을 보존하고 재접속에도 확인 질문을 반복하지 않는다", async t => {
  const previous = useTutiStore.getState(), options = useTutiStore.persist.getOptions();
  let saved = "";
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => saved || null,
    setItem(_key, value) { saved = value; }, removeItem() { saved = ""; } })) });
  t.after(() => { useTutiStore.setState(previous, true); useTutiStore.persist.setOptions(options); });
  useTutiStore.setState({ pendingDeparture: pending });
  useTutiStore.getState().confirmPendingDepartureReturn();
  assert.equal(JSON.parse(saved).state.pendingDeparture.returnConfirmed, true);
  await useTutiStore.persist.rehydrate();
  const confirmed = useTutiStore.getState().pendingDeparture!;
  assert.equal(confirmed.returnConfirmed, true);
  assert.equal(pendingMadiPath(confirmed, "owner", now), pendingMadiPath(pending, "owner", now));
  assert.equal(pendingMadiPath(confirmed, "other", now), null);
  useTutiStore.getState().postponePendingDeparture();
  assert.equal(useTutiStore.getState().pendingDeparture?.returnConfirmed, true);
  useTutiStore.setState({ pendingDeparture: { ...pending } });
  assert.equal(useTutiStore.getState().pendingDeparture?.returnConfirmed, undefined);
});

test("실제 바텀시트는 선택한 의도만 실행하고 닫힘 중 중복 클릭을 무시한다", () => {
  for (const [label, expected] of [["다녀온 마디 남기기", "write"], ["다녀왔어요 · 기록은 나중에", "visit"],
    ["아직이에요", "not-yet"], ["다음에 갈 공간으로 남겨두기", "save"]]) {
    const callbacks: string[] = [], timers: Array<() => void> = [];
    const h = clientFlowHarness("src/features/tuti/components/DepartureReturnSheet.tsx", "DepartureReturnSheet", {
      "@emotion/styled": { __esModule: true, default: styled }, "lucide-react": { MapPinCheck: "svg" },
      "@/features/tuti/components/buttons": { BaseButton: "button", PrimaryButton: "button", TextButton: "button" },
      "@/features/tuti/hooks/useDeferredAnimationStart": { useDeferredAnimationStart: () => true },
    }, { window: { setTimeout(callback: () => void, delay: number) { assert.equal(delay, 380); timers.push(callback); return timers.length; } } });
    const tree = h.render({ placeName: "산책길", onVisited: () => callbacks.push("write"), onVisitedLater: () => callbacks.push("visit"),
      onNotYet: () => callbacks.push("not-yet"), onLater: () => callbacks.push("save") });
    const click = findMadiControl(tree, p => p.children === label)!.onClick as () => void;
    click(); click(); assert.equal(timers.length, 1); assert.deepEqual(callbacks, []);
    timers[0](); assert.deepEqual(callbacks, [expected]);
  }
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  assert.match(flow, /!pendingDeparture\?\.returnConfirmed/);
  assert.match(flow, /onVisited=\{\(\) => confirmReturn\(true\)\}/);
  assert.match(flow, /onVisitedLater=\{\(\) => confirmReturn\(false\)\}/);
  assert.match(flow, /getSessionSnapshot\(\)\?\.userId !== session\?\.userId/);
});
