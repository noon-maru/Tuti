import assert from "node:assert/strict";
import test from "node:test";
import type { TutiPlace } from "@/lib/recommendations";
import { rankLongDistanceCandidatePool } from "@/server/recommendations/longDistanceCandidateRanking";
import { getNearbyDistancePolicy } from "@/server/recommendations/nearbyDistancePolicy";
import { derivePlaceMoodTags } from "@/server/tourism/placeMoodTags";
import { movementTimeBudget } from "@/shared/tuti/movementTimeBudget";
import { intakeSteps } from "@/features/tuti/data/intakeSteps";
import type { IntakeAnswers } from "@/shared/tuti/types";

function place(overrides: Partial<TutiPlace>): TutiPlace {
  return {
    id: "place",
    name: "테스트 장소",
    phrase: "",
    note: "",
    image: "",
    travelTime: "",
    crowd: "정보 없음",
    today: "",
    fatigue: 40,
    movementLevel: "half",
    moodTags: [],
    ...overrides,
  };
}

test("한 시간 외출 계산과 선택 문구가 같은 기준을 사용한다", () => {
  const nearOption = intakeSteps[0].options.find(
    (option) => option.value === "near",
  );

  assert.equal(movementTimeBudget.near.minutes, 60);
  assert.equal(nearOption?.label, "한 시간 안에");
  assert.equal(nearOption?.hint, "왕복 이동과 머무는 시간까지");
});

test("근거리 이동 단계마다 후보의 절대 최대 반경을 둔다", () => {
  assert.deepEqual(getNearbyDistancePolicy("near"), {
    targetMeters: 1_500,
    maximumMeters: 5_000,
  });
  assert.deepEqual(getNearbyDistancePolicy("short"), {
    targetMeters: 7_000,
    maximumMeters: 20_000,
  });
  assert.deepEqual(getNearbyDistancePolicy("half"), {
    targetMeters: 25_000,
    maximumMeters: 60_000,
  });
});

test("근거가 없는 장소에 트인 곳 태그를 기본 부여하지 않는다", () => {
  assert.deepEqual(
    derivePlaceMoodTags({
      name: "지역 관광 안내소",
      address: "대구광역시 중구",
      contentTypeId: "12",
    }),
    [],
  );
});

test("장소 유형과 공식 설명에 확인되는 특성만 태그로 분류한다", () => {
  assert.deepEqual(
    derivePlaceMoodTags({
      name: "호수 생태공원",
      contentTypeId: "12",
      overview: "한적한 호숫가 산책로에서 탁 트인 풍경을 볼 수 있다.",
    }),
    ["quiet", "open", "walk", "solitude"],
  );
  assert.deepEqual(
    derivePlaceMoodTags({
      name: "도심 역사박물관",
      contentTypeId: "14",
      overview: "실내 전시관을 관람하는 문화시설이다.",
    }),
    ["quiet"],
  );
  assert.deepEqual(
    derivePlaceMoodTags({
      name: "바다 전망 실내전시관",
      contentTypeId: "14",
      overview: "실내에서 전시와 공연을 관람한다.",
    }),
    [],
  );
});

test("장거리 경로 계산 전부터 공기와 밀도 답변으로 후보를 고른다", () => {
  const quiet = place({
    id: "quiet",
    moodTags: ["quiet", "solitude"],
    crowd: "한산",
  });
  const livelyOpen = place({
    id: "lively-open",
    moodTags: ["open"],
    crowd: "혼잡",
  });
  const candidates = [livelyOpen, quiet];
  const quietAnswers: IntakeAnswers = {
    movement: "far",
    air: "quiet",
    density: "quiet",
  };
  const livelyAnswers: IntakeAnswers = {
    movement: "far",
    air: "open",
    density: "lively",
  };

  assert.equal(
    rankLongDistanceCandidatePool(candidates, quietAnswers)[0].id,
    "quiet",
  );
  assert.equal(
    rankLongDistanceCandidatePool(candidates, livelyAnswers)[0].id,
    "lively-open",
  );
});
