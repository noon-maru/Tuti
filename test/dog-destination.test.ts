import test from "node:test";
import assert from "node:assert/strict";
import { assessDogDestination } from "@/server/recommendations/dogDestination";
import { rankDogPlaces, selectDogPlaces } from "@/server/recommendations/dogRanking";
import type { TutiPlace } from "@/lib/recommendations";

const base = { phrase: "", note: "", moodTags: [] };
test("동반 등록 상점의 상호를 산책·수변·사찰로 오인하지 않는다", () => {
  for (const name of ["호수약국", "스파오 제주중앙로점", "광우사", "피오체옴므 시티스타몰점", "올리브영 남대문시장점", "카페 베이지크", "편강 율 플래그십&티하우스"]) {
    assert.deepEqual(assessDogDestination({ ...base, name, sourceContentType: "38" }), { eligible: false, type: "other" });
  }
  assert.deepEqual(assessDogDestination({ ...base, name: "남대문시장", sourceContentType: "38" }), { eligible: true, type: "neighborhood" });
  assert.equal(assessDogDestination({ ...base, name: "섬타르", sourceContentType: "39" }).type, "other");
  assert.equal(assessDogDestination({ ...base, name: "숨", sourceContentType: "39", basicPayload: { lclsSystm3: "FD050100" } }).type, "cafe");
});
test("목적에 맞는 장소를 다양성이나 가까운 대체 후보 때문에 먼저 탈락시키지 않는다", () => {
  const outing = { weightsKg: [], leash: true, carrier: false, purpose: "cafe" as const };
  const places: TutiPlace[] = [0,1,2,3,4,5,6,7].map(i => ({ ...base, id: String(i), name: `장소 ${i}`, image: "", travelTime: "", crowd: "", today: "", fatigue: 0, movementLevel: "near", experienceType: i < 2 ? "forest_garden" : "cafe", distanceMeters: i * 1000 }));
  const ranked = rankDogPlaces(places, outing);
  const chosen = selectDogPlaces(ranked, ["7"], 6, outing);
  assert.equal(chosen.length, 6); assert.ok(chosen.every(p => p.experienceType === "cafe"));
  const limited = selectDogPlaces(rankDogPlaces(places.slice(0, 4), outing), [], 6, outing);
  assert.equal(limited.length, 4); assert.equal(limited[0].experienceType, "cafe");
  assert.match(limited.find(p => p.experienceType !== "cafe")!.reasonDetail!, /다른 동반 장소/);
});
