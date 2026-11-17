import test from "node:test";
import assert from "node:assert/strict";
import { parseOutingCategories } from "@/shared/pets/outingCategories";
import { parseDogOuting } from "@/shared/pets/dogAccess";
import { assessDogDestination, matchesDogPurpose } from "@/server/recommendations/dogDestination";
import { selectDogPlaces } from "@/server/recommendations/dogRanking";
import { createRecommendationInputFingerprint } from "@/features/tuti/recommendationInputFingerprint";
import type { TutiPlace } from "@/lib/recommendations";

const base: TutiPlace = { id: "base", name: "공원", image: "", phrase: "", note: "", moodTags: [], travelTime: "", today: "", crowd: "", fatigue: 0, movementLevel: "near" };
test("카테고리의 순서·중복은 정규화하고 미지원·과다 입력은 거절한다", () => {
  assert.deepEqual(parseOutingCategories(["cafe", "shopping", "cafe"]), ["shopping", "cafe"]);
  for (const invalid of ["cafe", ["invalid"], Array(7).fill("cafe"), null]) assert.equal(parseOutingCategories(invalid), null);
  assert.equal(parseDogOuting({ weightsKg: [], leash: null, carrier: null, categories: ["invalid"] }), null);
});
test("여러 카테고리는 합집합이며 개별 상점은 쇼핑을 직접 선택했을 때만 허용한다", () => {
  const outing = { weightsKg: [], leash: null, carrier: null, categories: ["shopping", "cafe"] as const };
  const input = { ...outing, categories: [...outing.categories] };
  const shop = { ...base, id: "shop", name: "올리브영 공원점", sourceContentType: "38", experienceType: "other" as const };
  assert.equal(assessDogDestination(shop).eligible, false);
  assert.equal(assessDogDestination(shop, input).eligible, true);
  const cafe = { ...base, id: "cafe", experienceType: "cafe" as const };
  const park = { ...base, id: "park", experienceType: "forest_garden" as const };
  assert.ok(matchesDogPurpose(shop, input)); assert.ok(matchesDogPurpose(cafe, input)); assert.equal(matchesDogPurpose(park, input), false);
  assert.deepEqual(selectDogPlaces([shop, cafe, park], [], 6, input).map(place => place.id), ["shop", "cafe"]);
  assert.equal(matchesDogPurpose(shop, { ...input, categories: ["park"] }), false);
});
test("동반 여부·카테고리 변경은 쿼리를 분리하고 클릭 순서만 바뀌면 캐시 키를 유지한다", () => {
  const key = (petCompanion: "dog" | "none", placeCategories: Array<"cafe" | "shopping">) => createRecommendationInputFingerprint({ answers: { petCompanion, placeCategories }, excludedPlaceIds: [] });
  assert.equal(key("dog", ["cafe", "shopping"]), key("dog", ["shopping", "cafe"]));
  assert.notEqual(key("dog", ["cafe"]), key("dog", ["shopping"]));
  assert.notEqual(key("dog", []), key("none", []));
});
