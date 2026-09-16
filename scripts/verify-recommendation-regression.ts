import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { createRecommendations } from "@/server/recommendations/service";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import type { PreferredRegion } from "@/shared/tuti/types";

const cases: Array<{ label: string; region: PreferredRegion }> = [
  {
    label: "서울 종로구",
    region: {
      areaCode: "1",
      name: "서울특별시",
      sigunguCode: "110",
      sigunguName: "종로구",
    },
  },
  {
    label: "부산 해운대구",
    region: {
      areaCode: "6",
      name: "부산광역시",
      sigunguCode: "350",
      sigunguName: "해운대구",
    },
  },
  {
    label: "강원 원주시",
    region: {
      areaCode: "32",
      name: "강원특별자치도",
      sigunguCode: "130",
      sigunguName: "원주시",
    },
  },
  {
    label: "제주 제주시",
    region: {
      areaCode: "39",
      name: "제주특별자치도",
      sigunguCode: "110",
      sigunguName: "제주시",
    },
  },
];

try {
  const reports = [];

  for (const testCase of cases) {
    const places = await createRecommendations(
      { movement: "short", air: "quiet", density: "balanced" },
      undefined,
      testCase.region,
    );
    const experienceTypes = new Set(
      places.map(({ experienceType }) => experienceType).filter(Boolean),
    );
    const rankingScores = new Set(places.map(({ rankingScore }) => rankingScore));

    assert.equal(places.length, 6, `${testCase.label}: 추천 6곳이 필요합니다.`);
    assert.ok(
      places.every(
        ({ sourceSigunguName }) =>
          sourceSigunguName === testCase.region.sigunguName,
      ),
      `${testCase.label}: 다른 시군구 장소가 섞였습니다.`,
    );
    assert.ok(
      places.every(
        ({ rankingScore, fatigueScore }) =>
          Number.isFinite(rankingScore) &&
          Number.isInteger(fatigueScore) &&
          fatigueScore! >= 1 &&
          fatigueScore! <= 99,
      ),
      `${testCase.label}: 원점수 또는 표시 피로도 척도가 올바르지 않습니다.`,
    );
    assert.ok(
      rankingScores.size >= 2,
      `${testCase.label}: 추천 점수가 한 값에 몰렸습니다.`,
    );
    assert.ok(
      experienceTypes.size >= 3,
      `${testCase.label}: 경험 유형이 세 종류보다 적습니다.`,
    );

    reports.push({
      region: testCase.label,
      places: places.length,
      experienceTypes: [...experienceTypes],
      rankingScores: [...rankingScores].sort((left, right) => left! - right!),
    });
  }

  console.log(
    JSON.stringify(
      { algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION, reports },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
