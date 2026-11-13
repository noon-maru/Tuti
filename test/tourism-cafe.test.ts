import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyCafe } from "@/server/tourism/cafeClassification";
import { assessPlaceExperienceType } from "@/server/recommendations/experienceType";
import { derivePlaceRecommendationFeatures } from "@/server/recommendations/placeRecommendationFeatures";
import { assessPlaceCandidate, type PlaceCandidateInput } from "@/server/recommendations/placeCandidateSelection";
import { filterPlacesByAdmissionBudget } from "@/server/recommendations/admissionFee";
import type { TutiPlace } from "@/lib/recommendations";

test("기존 카페가 재선정될 때도 마린데크의 요약·행동 입력을 제공한다", () => {
  for (const [file, field] of [["place-overview-summaries", "summary"], ["place-suggested-actions", "action"]]) {
    const rows = readFileSync(`data/${file}/2026-10-01.jsonl`, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as Record<string, string>);
    const matches = rows.filter(row => row.contentId === "2717286");
    assert.equal(matches.length, 1);
    assert.ok(matches[0][field].trim());
    assert.ok(matches[0][field].length <= (field === "summary" ? 180 : 60));
  }
});

test("관광공사 카페·찻집 신분류는 상호에 카페가 없어도 판별한다", () => {
  for (const categoryCode of ["FD050100", "FD050200"]) assert.equal(classifyCafe({ name: "가는곶 세화", contentTypeId: "39", categoryCode }).kind, "venue");
  assert.equal(classifyCafe({ name: "가드너스", contentTypeId: "39", legacyCategoryCode: "A05020900" }).kind, "venue");
  assert.equal(classifyCafe({ name: "카페라는 식당", contentTypeId: "39", categoryCode: "FD010100", legacyCategoryCode: "A05020900" }).kind, "unrelated");
  assert.equal(classifyCafe({ name: "주스", contentTypeId: "39", categoryCode: "FD050300", legacyCategoryCode: "A05020900" }).kind, "unrelated");
});

test("카페거리·공원·박물관·농원·캠핑장은 카페 매장으로 편입하지 않는다", () => {
  for (const name of ["성수동 카페거리", "산소카페 청송정원", "커피커퍼박물관", "엉또돌다카페앤농원", "카페 글램핑", "마이산홍삼족욕카페", "알파카 체험카페 마추픽추", "카페도자기마을"]) {
    assert.equal(classifyCafe({ name }).kind, "related", name);
  }
  assert.equal(classifyCafe({ name: "풍양카페리 터미널" }).kind, "unrelated");
  assert.equal(classifyCafe({ name: "마을 카페", overview: "주변에 박물관과 공원이 있다." }).kind, "venue");
});

test("커피 명칭만 있거나 주변 카페 설명만 있으면 판단을 유보한다", () => {
  assert.equal(classifyCafe({ name: "씨즈커피 코리아", overview: "커피 공장 견학 시설이다. 주변에 카페도 있다." }).kind, "ambiguous");
  assert.equal(classifyCafe({ name: "오늘커피", overview: "오늘커피는 동네 카페다." }).kind, "venue");
  assert.equal(classifyCafe({ name: "오늘 공원", overview: "카페가 인근에 있다." }).kind, "unrelated");
});

test("실제 카페만 독립 경험 유형으로 분류하고 기존 명소의 유형은 유지한다", () => {
  const base = { phrase: "", note: "", moodTags: [], sourceContentType: "12" };
  assert.equal(assessPlaceExperienceType({ ...base, name: "카페 방림별곡" }).type, "cafe");
  assert.equal(assessPlaceExperienceType({ ...base, name: "기차왕국박물관카페" }).type, "museum_story");
  assert.equal(assessPlaceExperienceType({ ...base, name: "성수동 카페거리" }).type, "neighborhood");
  assert.equal(assessPlaceExperienceType({ ...base, name: "산소카페 청송정원" }).type, "forest_garden");
});

test("카페의 선택 체험 언급으로 이동 부담을 높이거나 조용함을 추측하지 않는다", () => {
  const features = derivePlaceRecommendationFeatures({ name: "카페 방림별곡", overview: "마을 카페다. 쿠키 만들기 체험도 가능하다." });
  assert.equal(features.experienceType, "cafe");
  assert.equal(features.movementLevel, "near");
  assert.ok(!features.moodTags.includes("quiet"));
  assert.ok(!features.moodTags.includes("walk"));
});

function cafe(overrides: Partial<PlaceCandidateInput> = {}): PlaceCandidateInput {
  return { id: "test-cafe", name: "마을 카페", image: "https://example.com/cafe.jpg", fatigue: 22, movementLevel: "near", moodTags: [],
    latitude: 37, longitude: 127, contentTypeId: "39", categoryCode: "FD050100", address: "서울", sidoName: "서울", sigunguName: "마포구", copyright: "Type1",
    hasWellnessSource: false, hasCoreTourismSource: false, hasSeoulRealtimeArea: false,
    detail: { synced: true, overview: "음료를 판매하는 마을 카페다.", openingHours: "10:00~18:00", restDate: null, reservation: null, usageDuration: null, experienceGuide: null, imageCount: 1 }, ...overrides };
}

test("자연·혼잡도 연계 점수가 없어도 카페의 가벼운 머무름을 평가한다", () => {
  const result = assessPlaceCandidate(cafe());
  assert.equal(result.status, "selected");
  assert.ok(result.reasons.includes("Tuti 적합성: 카페·찻집에서 짧게 머무는 경험"));
});

test("사진·좌표·공식 소개가 없거나 폐업 표현이 있으면 자동 선정하지 않는다", () => {
  assert.equal(assessPlaceCandidate(cafe({ image: "" })).status, "invalid");
  assert.equal(assessPlaceCandidate(cafe({ latitude: 0, longitude: 0 })).status, "invalid");
  assert.equal(assessPlaceCandidate(cafe({ detail: null })).status, "enrich");
  assert.equal(assessPlaceCandidate(cafe({ name: "폐업 마을 카페" })).status, "invalid");
});

test("카페 입장료 무료를 음료 구매 비용까지 무료인 추천으로 해석하지 않는다", () => {
  const place = { id: "cafe", experienceType: "cafe", admissionFee: "무료" } as TutiPlace;
  assert.deepEqual(filterPlacesByAdmissionBudget([place], "free"), []);
  assert.deepEqual(filterPlacesByAdmissionBudget([place], undefined), [place]);
});
