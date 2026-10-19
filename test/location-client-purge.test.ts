import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { createJSONStorage } from "zustand/middleware";
import { clearLocationQueryCache } from "../src/features/tuti/location/clearLocationQueries";
import { useTutiStore } from "../src/store/tuti";
import { LOCATION_TERMS_VERSION } from "../src/shared/location/terms";

test("철회는 개별 경로 요청까지 취소·제거하고 무관한 기록 캐시는 보존한다", async () => {
  const client = new QueryClient();
  let signal: AbortSignal | undefined;
  const pending = client.fetchQuery({
    queryKey: ["departure-route", "place", 37, 127],
    queryFn: (context) => {
      signal = context.signal;
      return new Promise<void>((_resolve, reject) => context.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    },
  }).catch(() => {});
  for (const key of ["departure-plan", "travel-time", "recommendations", "journal-entries"]) client.setQueryData([key], { value: key });
  clearLocationQueryCache(client);
  await pending;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(client.getQueryCache().getAll().map((query) => query.queryKey), [["journal-entries"]]);
  client.clear();
});

test("기기 철회는 원본·추천 지문·출발 상태를 저장소에서도 지우고 찜은 남긴다", () => {
  let saved = "";
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem: (_key, value) => { saved = value; }, removeItem: () => {} })) });
  const location = { latitude: 37, longitude: 127 };
  const accepted = { status: "accepted" as const, termsVersion: LOCATION_TERMS_VERSION, updatedAt: "2026-10-19T00:00:00Z" };
  const daily = { effectiveDate: "2026-10-19", cycle: 0, recommendationId: "run", algorithmVersion: "test", inputFingerprint: "37,127", places: [] };
  const favorite = { journeyId: "saved", placeId: "place", placeName: "기억할 곳", placeImage: "", placePhrase: "", savedAt: "2026-10-19" };
  useTutiStore.setState({ userLocation: location, locationConsent: accepted, dailyRecommendation: daily, savedDeparturePlaces: [favorite] });
  useTutiStore.getState().withdrawLocationConsent();
  assert.equal(useTutiStore.getState().userLocation, undefined);
  assert.equal(useTutiStore.getState().dailyRecommendation, undefined);
  assert.deepEqual(useTutiStore.getState().savedDeparturePlaces, [favorite]);
  assert.doesNotMatch(saved, /37,127|inputFingerprint|userLocation/);
  assert.equal(JSON.parse(saved).state.locationConsent.status, "withdrawn");

  useTutiStore.setState({ locationConsent: accepted, userLocation: location, dailyRecommendation: daily });
  useTutiStore.getState().syncLocationConsent({ ...accepted, updatedAt: "2026-10-19T01:00:00Z" });
  assert.equal(useTutiStore.getState().locationConsent?.status, "accepted");
  assert.equal(useTutiStore.getState().userLocation, undefined);
  assert.equal(useTutiStore.getState().dailyRecommendation, undefined);
  useTutiStore.setState({ userLocation: location, dailyRecommendation: daily });
  useTutiStore.getState().clearUserLocation();
  assert.equal(useTutiStore.getState().dailyRecommendation, undefined, "서버 실패 전에도 기기의 예전 추천은 제거한다.");
});
