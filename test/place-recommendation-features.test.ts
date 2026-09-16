import assert from "node:assert/strict";
import test from "node:test";
import { derivePlaceRecommendationFeatures } from "@/server/recommendations/placeRecommendationFeatures";

test("짧고 조용한 공간은 가까운 움직임과 낮은 피로도로 계산한다", () => {
  const features = derivePlaceRecommendationFeatures({
    name: "고요한 정원",
    contentTypeId: "12",
    overview: "조용히 산책하며 쉴 수 있는 작은 정원이다.",
    usageDuration: "약 40분",
  });

  assert.equal(features.experienceType, "forest_garden");
  assert.equal(features.movementLevel, "near");
  assert.ok(features.fatigue < 30);
  assert.ok(features.moodTags.includes("quiet"));
});

test("오래 걸리는 체험은 반나절 움직임과 높은 피로도로 계산한다", () => {
  const features = derivePlaceRecommendationFeatures({
    name: "산악 레저 체험장",
    contentTypeId: "28",
    overview: "장거리 트레킹과 클라이밍을 직접 체험한다.",
    usageDuration: "3시간 30분",
    reservation: "사전 예약제",
  });

  assert.equal(features.experienceType, "activity");
  assert.equal(features.movementLevel, "half");
  assert.ok(features.fatigue >= 60);
});

test("이용시간 범위는 양 끝을 더하지 않고 긴 쪽을 사용한다", () => {
  const features = derivePlaceRecommendationFeatures({
    name: "작은 도서관",
    contentTypeId: "14",
    usageDuration: "30분~1시간",
  });

  assert.equal(features.movementLevel, "near");
  assert.ok(features.fatigue < 40);
});
