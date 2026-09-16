import assert from "node:assert/strict";
import test from "node:test";
import type { PlaceExperienceType, TutiPlace } from "@/lib/recommendations";
import { derivePlaceExperienceType } from "@/server/recommendations/experienceType";
import { selectDiverseRecommendations } from "@/server/recommendations/finalDiversity";

function createPlace(
  id: string,
  experienceType: PlaceExperienceType,
  rankingScore: number,
): TutiPlace {
  return {
    id,
    name: id,
    phrase: "잠깐 머물기 좋은 공간",
    note: "",
    image: "",
    travelTime: "",
    crowd: "보통",
    today: "",
    fatigue: 30,
    movementLevel: "short",
    moodTags: ["quiet"],
    rankingScore,
    fatigueScore: 30,
    experienceType,
  };
}

test("상세 문구와 장소 성격을 경험 유형으로 분류한다", () => {
  const common: Pick<
    TutiPlace,
    "phrase" | "note" | "sourceContentType" | "moodTags"
  > = {
    phrase: "",
    note: "",
    sourceContentType: "12",
    moodTags: ["quiet"],
  };

  assert.equal(
    derivePlaceExperienceType({ ...common, name: "한강 시민공원" }),
    "waterside",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "현대미술 전시관" }),
    "art_exhibition",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "옛 성곽 산책길" }),
    "history_heritage",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "마을 골목 시장" }),
    "neighborhood",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "동화마을수목원" }),
    "forest_garden",
  );
  assert.equal(
    derivePlaceExperienceType({
      ...common,
      name: "장안근린공원",
      overview: "지역 예술가의 작품도 만날 수 있는 공원이다.",
    }),
    "forest_garden",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "수월봉" }),
    "viewpoint",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "건봉사" }),
    "history_heritage",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "정관온천" }),
    "wellness",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "올림픽대교" }),
    "other",
  );
  assert.equal(
    derivePlaceExperienceType({ ...common, name: "인천대교 전망대" }),
    "viewpoint",
  );
});

test("비슷한 품질 안에서는 같은 경험이 두 곳을 넘지 않게 재정렬한다", () => {
  const selected = selectDiverseRecommendations(
    [
      createPlace("forest-1", "forest_garden", 1),
      createPlace("forest-2", "forest_garden", 2),
      createPlace("forest-3", "forest_garden", 3),
      createPlace("forest-4", "forest_garden", 4),
      createPlace("water", "waterside", 5),
      createPlace("art", "art_exhibition", 6),
      createPlace("history", "history_heritage", 7),
      createPlace("view", "viewpoint", 8),
    ],
    6,
  );
  const counts = selected.reduce((result, place) => {
    const type = place.experienceType!;
    result.set(type, (result.get(type) ?? 0) + 1);
    return result;
  }, new Map<PlaceExperienceType, number>());

  assert.equal(selected.length, 6);
  assert.ok(counts.size >= 4);
  assert.ok(Math.max(...counts.values()) <= 2);
});

test("품질 구간 밖의 장소는 유형만 다르다는 이유로 끌어올리지 않는다", () => {
  const selected = selectDiverseRecommendations(
    [
      ...Array.from({ length: 6 }, (_, index) =>
        createPlace(`near-${index}`, "forest_garden", index),
      ),
      createPlace("far-worse", "waterside", 100),
    ],
    6,
  );

  assert.equal(selected.some(({ id }) => id === "far-worse"), false);
});
