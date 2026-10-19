import assert from "node:assert/strict";
import test from "node:test";

const row = {
  id: "ordinary-hours", name: "작은 공원", phrase: "", note: "", image: "",
  travelTime: "", crowd: "정보 없음", today: "", fatigue: 30,
  movementLevel: "near", moodTags: ["quiet", "walk"],
  sourceContentType: "12", experienceType: "forest_garden",
  visibilityOverride: "auto", latitude: 33.5, longitude: 126.53,
  distanceMeters: 500,
  detailOpeningHours: "09:00~18:00", detailRestDate: "매주 월요일",
};
(globalThis as { prisma?: unknown }).prisma = {
  $queryRaw: async () => [row],
};
const { createRecommendations } = await import("../src/server/recommendations/service");
const location = { latitude: 33.4996, longitude: 126.5312 };
const recommendAt = (at: string) => createRecommendations(
  { movement: "near", transport: "transit" }, location,
  undefined, [], undefined, [], new Date(at),
);

test("기준시각을 주입하면 실행 시각과 무관하게 통상 영업시간으로 추천한다", async () => {
  assert.equal((await recommendAt("2026-10-20T12:00:00+09:00")).length, 1);
  assert.equal((await recommendAt("2026-10-20T20:00:00+09:00")).length, 0);
  assert.equal((await recommendAt("2026-10-19T12:00:00+09:00")).length, 0);
  assert.equal((await recommendAt("2026-10-20T12:00:00+09:00")).length, 1);
});
