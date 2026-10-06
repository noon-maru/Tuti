import assert from "node:assert/strict";
import test from "node:test";
import {
  assessPlaceCandidate,
  type PlaceCandidateInput,
} from "../src/server/recommendations/placeCandidateSelection";

test("주변 캠핑장이나 금지 활동이 언급된 산책 장소를 고부담으로 제외하지 않는다", () => {
  const assessment = assessPlaceCandidate(createPlace({
    name: "화랑의 언덕",
    contentTypeId: "12",
    detail: createDetail({
      overview: "산책과 피크닉은 가능하지만 캠핑과 차박은 불가하다.",
    }),
  }));

  assert.equal(
    assessment.reasons.includes("실행 부담: 준비·활동 부담이 큰 경험"),
    false,
  );
  assert.notEqual(assessment.status, "low_burden_mismatch");
});

test("캠핑장과 레포츠 중심 장소는 기존 고부담 판정을 유지한다", () => {
  const namedCampground = assessPlaceCandidate(createPlace({
    name: "숲속 오토캠핑장",
    contentTypeId: "28",
  }));
  const leisureCampingSite = assessPlaceCandidate(createPlace({
    name: "숲 체험장",
    contentTypeId: "28",
    detail: createDetail({ overview: "장비를 준비해 캠핑을 즐기는 곳이다." }),
  }));

  for (const assessment of [namedCampground, leisureCampingSite]) {
    assert.equal(
      assessment.reasons.includes("실행 부담: 준비·활동 부담이 큰 경험"),
      true,
    );
  }
});

test("실시간 연계 점수가 부족해도 적합성과 실행 용이성이 높으면 선정한다", () => {
  const assessment = assessPlaceCandidate(createPlace({
    detail: createDetail({
      synced: false,
      imageCount: 0,
    }),
  }));

  assert.equal(assessment.score < 70, true);
  assert.equal(assessment.sections.tutiFit >= 21, true);
  assert.equal(assessment.sections.executionEase >= 20, true);
  assert.equal(assessment.status, "selected");
});

function createPlace(
  overrides: Partial<PlaceCandidateInput> = {},
): PlaceCandidateInput {
  return {
    id: "test-place",
    name: "고요한 수변공원",
    image: "https://example.com/place.jpg",
    fatigue: 25,
    movementLevel: "near",
    moodTags: ["quiet", "walk"],
    latitude: 35.8,
    longitude: 129.2,
    contentTypeId: "12",
    address: "경상북도 경주시",
    sidoName: "경상북도",
    sigunguName: "경주시",
    copyright: "한국관광공사",
    hasWellnessSource: false,
    hasCoreTourismSource: false,
    hasSeoulRealtimeArea: false,
    detail: createDetail(),
    ...overrides,
  };
}

function createDetail(
  overrides: Partial<NonNullable<PlaceCandidateInput["detail"]>> = {},
): NonNullable<PlaceCandidateInput["detail"]> {
  return {
    synced: true,
    overview: "천천히 산책하며 쉬어갈 수 있는 공원이다.",
    openingHours: null,
    restDate: null,
    reservation: null,
    usageDuration: null,
    experienceGuide: null,
    imageCount: 1,
    ...overrides,
  };
}
