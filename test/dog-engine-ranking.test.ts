import assert from "node:assert/strict";
import test from "node:test";
import { scoreDogPlace, rankDogPlaces, selectDogPlaces } from "../src/server/recommendations/dogRanking";
import { normalizeDogPlaceBasic } from "../src/server/tourism/dogPlaceBasic";
import { dogCatalogState } from "../src/server/tourism/registerDogPlace";
import type { TutiPlace } from "../src/lib/recommendations";
const place = (id: string, type: TutiPlace["experienceType"] = "forest_garden"): TutiPlace => ({ id, name: id, image: "", phrase: "", note: "", travelTime: "", crowd: "", today: "", fatigue: 999, movementLevel: "half", moodTags: [], experienceType: type, distanceMeters: 1000 });
test("새 동반 점수는 기존 피로도·저부담 점수와 무관하며 모르는 시설·날씨에 가점을 만들지 않는다", () => {
  assert.deepEqual(scoreDogPlace(place("a")), scoreDogPlace({ ...place("a"), fatigue: 0, fatigueScore: 0, rankingScore: -999, moodTags: ["quiet"] }));
  const score = scoreDogPlace(place("a"));
  assert.equal(score.access, 0); assert.equal(score.weather, 0); assert.equal(score.purpose, 0);
  assert.equal(scoreDogPlace({ ...place("unknown"), executionFeasibility: { fitStatus: "unknown", fitsAvailableTime: true } as TutiPlace["executionFeasibility"] }).time, 0);
  assert.ok(scoreDogPlace(place("cafe", "cafe"), { weightsKg: [], leash: false, carrier: false, purpose: "cafe" }).purpose > score.purpose);
});
test("같은 입력 순위는 결정적이고 다시 고르기는 기존 결과로 부족분만 채운다", () => {
  const rows = [...Array(10)].map((_, i) => place(String(i), i % 2 ? "cafe" : "forest_garden"));
  const a = rankDogPlaces(rows), b = rankDogPlaces([...rows].reverse());
  assert.deepEqual(a.map(p => p.id), b.map(p => p.id));
  const selected = selectDogPlaces(a, ["0", "1", "2", "3", "4", "5", "6", "7"]);
  assert.deepEqual(new Set(selected.slice(0, 2).map(p => p.id)), new Set(["8", "9"]));
  assert.equal(selected.length, 6); assert.equal(new Set(selected.map(p => p.id)).size, 6);
});
test("사진 없는 유효한 장소도 등록 가능하되 좌표·중복 ID·폐업과 수동 제외는 우회하지 않는다", () => {
  const record = { contentId: "1", source: "pet-list" as const, fetchedAt: new Date().toISOString(), item: { contentid: "1", title: "함께 카페", mapy: "37.5", mapx: "127.1", addr1: "서울특별시 강남구" } };
  assert.equal(normalizeDogPlaceBasic(record)?.image, "");
  assert.equal(normalizeDogPlaceBasic({ ...record, item: { ...record.item, mapy: "0" } }), null);
  assert.equal(normalizeDogPlaceBasic({ ...record, contentId: "2" }), null);
  const legacy = { name: "공원", reviewStatus: "approved", visibilityOverride: "auto", candidateOverride: "auto" };
  assert.equal(dogCatalogState(legacy, true).status, "ready");
  assert.equal(dogCatalogState({ ...legacy, reviewStatus: "rejected" }, true).status, "review_required");
  assert.equal(dogCatalogState({ ...legacy, visibilityOverride: "hide" }, true).status, "excluded");
  assert.equal(dogCatalogState({ ...legacy, candidateOverride: "exclude" }, true).status, "excluded");
});
