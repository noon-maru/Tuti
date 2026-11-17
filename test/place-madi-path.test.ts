import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { placeMadiPath, savedDepartureDestination } from "@/shared/tuti/placeMadiPath";
import { safeLoginReturn } from "@/lib/loginContinuation";
import { pendingMadiPath } from "@/shared/tuti/pendingMadi";
import { useTutiStore } from "@/store/tuti";
import { createJSONStorage } from "zustand/middleware";

test("나중에 갈 공간으로 미뤄도 선택 책을 보존하고 다른 계정에는 이어주지 않는다", t => {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })) });
  const previous = useTutiStore.getState(); t.after(() => useTutiStore.setState(previous, true));
  useTutiStore.setState({ savedDeparturePlaces: [], pendingDeparture: { ownerId: "owner", harumadiId: "book", journeyId: "journey", placeId: "place", placeName: "산책길", placeImage: "", placePhrase: "", routeMode: "walking", startedAt: new Date().toISOString(), promptAfter: new Date().toISOString() } });
  useTutiStore.getState().deferPendingDeparture();
  const saved = useTutiStore.getState().savedDeparturePlaces[0];
  assert.equal(savedDepartureDestination(saved, "owner"), "book");
  assert.equal(savedDepartureDestination(saved, "other"), null);
  assert.equal(savedDepartureDestination({ harumadiId: "old-book" }, "owner"), null);
  assert.equal(useTutiStore.getState().pendingDeparture, undefined);
});

test("본인이 선택한 책과 장소는 로그인 경유에도 유지되며 임의 목적지 URL은 전달하지 않는다", () => {
  const path = placeMadiPath({ id: "p-1", name: "함께 걸은 길" }, "j-1", "book-1");
  assert.equal(new URL(path, "https://tuti.test").searchParams.get("harumadiId"), "book-1");
  assert.deepEqual(Object.fromEntries(new URL(safeLoginReturn(path)!, "https://tuti.test").searchParams), Object.fromEntries(new URL(path, "https://tuti.test").searchParams));
  assert.equal(safeLoginReturn("/explore?harumadiId=book-1&ownerId=user-1&redirect=https://evil.test"), "/explore?harumadiId=book-1&ownerId=user-1");
});

test("책장 이어 남기기는 계정·시각·만료를 확인하고 방문을 생성하지 않는다", () => {
  const now = Date.parse("2026-11-16T10:00:00Z");
  const pending = { ownerId: "u1", harumadiId: "b1", placeId: "p1", placeName: "산책길", journeyId: "j1", startedAt: new Date(now - 3600_000).toISOString(), promptAfter: new Date(now - 1000).toISOString() };
  assert.match(pendingMadiPath(pending, "u1", now)!, /harumadiId=b1/);
  assert.equal(pendingMadiPath(pending, "u2", now), null);
  assert.equal(pendingMadiPath({ ...pending, ownerId: undefined }, "u1", now), null);
  assert.equal(pendingMadiPath({ ...pending, startedAt: "invalid" }, "u1", now), null);
  assert.equal(pendingMadiPath(pending, "u1", now - 3600_000), null);
  assert.equal(pendingMadiPath(pending, "u1", now + 8 * 86400_000), null);
});

test("명시적 장소 작성은 장소명·ID만 안전하게 채우고 로그인 후에도 복원한다", () => {
  const path = placeMadiPath({ id: "tourapi-1", name: "양평 유수지 & 생태공원" }, "journey-1");
  const params = new URL(path, "https://tuti.test").searchParams;
  assert.equal(params.get("placeName"), "양평 유수지 & 생태공원");
  assert.equal(params.get("placeId"), "tourapi-1");
  assert.equal(params.get("journeyId"), "journey-1");
  assert.equal(safeLoginReturn(path), path);
  assert.ok(!safeLoginReturn("/madi/new?placeName=x%0Ay")?.includes("placeName"));
  assert.ok(!safeLoginReturn(`/madi/new?placeName=${"x".repeat(101)}`)?.includes("placeName"));
  const detail = readFileSync("src/features/tuti/screens/detail/DetailScreen.tsx", "utf8");
  assert.match(detail, /onCreateMadi && <CreateMadi type="button" onClick=\{onCreateMadi\}/);
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  const general = flow.slice(flow.indexOf("onCreateMadi={() =>"), flow.indexOf("onCreatePlaceMadi={"));
  assert.doesNotMatch(general, /placeName|placeMadiPath/);
});
