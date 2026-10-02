import { prisma } from "@/server/db/prisma";
import { createRecommendations } from "@/server/recommendations/service";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import { movementTimeBudget } from "@/shared/tuti/movementTimeBudget";
import type {
  MovementAnswer,
  TransportAnswer,
  UserLocation,
} from "@/shared/tuti/types";

type RepresentativeLocation = UserLocation & {
  id: "seoul" | "busan" | "wonju" | "jeju";
  label: string;
  allowSparseResults?: boolean;
};

type StayRange = readonly [minimum: number, typical: number, maximum: number];

const locations: readonly RepresentativeLocation[] = [
  {
    id: "seoul",
    label: "서울시청",
    latitude: 37.5665,
    longitude: 126.978,
  },
  {
    id: "busan",
    label: "부산 해운대",
    latitude: 35.1631,
    longitude: 129.1635,
  },
  {
    id: "wonju",
    label: "원주시청",
    latitude: 37.3419,
    longitude: 127.9202,
    allowSparseResults: true,
  },
  {
    id: "jeju",
    label: "제주시청",
    latitude: 33.4996,
    longitude: 126.5312,
  },
];

const movements = ["near", "short", "half"] as const satisfies readonly MovementAnswer[];
const transports = ["car", "transit"] as const satisfies readonly TransportAnswer[];
const recommendationLimit = 6;

/**
 * 이름과 공식 설명만으로도 현재 저장 유형이 명백히 잘못된 장소들이다.
 * 후보 순위에서 사라져도 회귀를 놓치지 않도록 추천 결과가 아닌 DB 행을 직접 검사한다.
 */
const experienceTypeAnchors = [
  { name: "씨랄라 워터파크", expected: "activity" },
  { name: "폭포책방 아름인도서관", expected: "museum_story" },
  { name: "인왕산 국사당", expected: "history_heritage" },
  { name: "민락수변공원", expected: "waterside" },
  { name: "조현화랑", expected: "art_exhibition" },
  { name: "장기려기념 더 나눔센터", expected: "museum_story" },
  { name: "중앙해수랜드", expected: "wellness" },
  { name: "원주 강원감영", expected: "history_heritage" },
  { name: "금련산", expected: "viewpoint" },
  { name: "황령산레포츠공원", expected: "activity" },
  { name: "두물수변공원", expected: "waterside" },
  { name: "치악예술관", expected: "art_exhibition" },
  { name: "주정공장수용소 4·3역사관", expected: "museum_story" },
  { name: "하리보 해피월드", expected: "art_exhibition" },
  { name: "제주문화원", expected: "museum_story" },
] as const;

/** 공식 이용시간 원문이 있는 주요 장소의 정밀 프로필 회귀 기준. */
const exactStayRangeAnchors = [
  { name: "씨랄라 워터파크", expected: [120, 240, 420] },
  { name: "장기려기념 더 나눔센터", expected: [20, 30, 45] },
  { name: "청와대 사랑채", expected: [45, 60, 75] },
] as const satisfies readonly { name: string; expected: StayRange }[];

const errors: string[] = [];
const reports: Array<{
  caseId: string;
  count: number;
  impossibleCount: number;
  missingProfileCount: number;
  experienceTypes: string[];
}> = [];

function check(condition: unknown, message: string) {
  if (!condition) errors.push(message);
}

function checkStayRange(
  label: string,
  range: StayRange,
) {
  const [minimum, typical, maximum] = range;
  check(
    range.every(Number.isInteger),
    `${label}: 체류시간은 모두 정수여야 합니다 (${range.join("/")}).`,
  );
  check(
    minimum >= 10 && minimum <= typical && typical <= maximum && maximum <= 720,
    `${label}: 10 ≤ 최소 ≤ 일반 ≤ 최대 ≤ 720분 범위를 벗어났습니다 (${range.join("/")}).`,
  );
}

try {
  for (const location of locations) {
    for (const movement of movements) {
      for (const transport of transports) {
        const caseId = `${location.id}/${movement}/${transport}`;
        const places = await createRecommendations(
          { movement, transport },
          {
            latitude: location.latitude,
            longitude: location.longitude,
          },
        );

        if (location.allowSparseResults) {
          check(
            places.length >= 1 && places.length <= recommendationLimit,
            `${caseId}: 희소지역도 추천은 1곳 이상, ${recommendationLimit}곳 이하여야 합니다 (${places.length}곳).`,
          );
        } else {
          check(
            places.length === recommendationLimit,
            `${caseId}: 추천 ${recommendationLimit}곳이 필요합니다 (${places.length}곳).`,
          );
        }

        let impossibleCount = 0;
        let missingProfileCount = 0;

        for (const place of places) {
          const prefix = `${caseId}/${place.name}`;
          const profile = place.visitTimeProfile;
          const feasibility = place.executionFeasibility;

          if (!profile) {
            missingProfileCount += 1;
            errors.push(`${prefix}: 체류시간 프로필이 없습니다.`);
          } else {
            checkStayRange(prefix, [
              profile.stayMinimumMinutes,
              profile.stayTypicalMinutes,
              profile.stayMaximumMinutes,
            ]);
          }

          if (!feasibility) {
            errors.push(`${prefix}: 실행 가능성 계산 결과가 없습니다.`);
            continue;
          }

          if (
            feasibility.fitStatus === "impossible" ||
            feasibility.fitsAvailableTime === false
          ) {
            impossibleCount += 1;
            errors.push(`${prefix}: 실행 불가능한 장소가 추천되었습니다.`);
          }

          check(
            feasibility.minimumTotalMinutes !== undefined &&
              feasibility.minimumTotalMinutes <= movementTimeBudget[movement].minutes,
            `${prefix}: 최소 전체 소요시간이 ${movementTimeBudget[movement].minutes}분 예산을 초과했습니다 (${feasibility.minimumTotalMinutes ?? "없음"}분).`,
          );
          check(
            feasibility.recommendedStayMinutes !== undefined &&
              feasibility.recommendedStayMinutes >= feasibility.minimumStayMinutes &&
              feasibility.recommendedStayMinutes <=
                (feasibility.maximumStayMinutes ?? feasibility.minimumStayMinutes),
            `${prefix}: 권장 체류시간이 최소·최대 범위 밖입니다.`,
          );
        }

        reports.push({
          caseId,
          count: places.length,
          impossibleCount,
          missingProfileCount,
          experienceTypes: [...new Set(
            places.flatMap((place) => place.experienceType ?? []),
          )].sort(),
        });
      }
    }
  }

  check(
    reports.length === locations.length * movements.length * transports.length,
    `대표 좌표 조합은 24건이어야 합니다 (${reports.length}건).`,
  );

  const anchorNames = [
    ...experienceTypeAnchors.map(({ name }) => name),
    ...exactStayRangeAnchors.map(({ name }) => name),
  ];
  const anchorPlaces = await prisma.place.findMany({
    where: { name: { in: [...new Set(anchorNames)] } },
    select: {
      name: true,
      experienceType: true,
      visitTimeProfile: {
        select: {
          stayMinimumMinutes: true,
          stayTypicalMinutes: true,
          stayMaximumMinutes: true,
        },
      },
    },
  });
  const anchorByName = new Map(anchorPlaces.map((place) => [place.name, place]));

  for (const anchor of experienceTypeAnchors) {
    const place = anchorByName.get(anchor.name);
    check(Boolean(place), `${anchor.name}: 오분류 회귀 기준 장소가 DB에 없습니다.`);
    check(
      place?.experienceType === anchor.expected,
      `${anchor.name}: 경험 유형은 ${anchor.expected}이어야 합니다 (현재 ${place?.experienceType ?? "없음"}).`,
    );
  }

  for (const anchor of exactStayRangeAnchors) {
    const profile = anchorByName.get(anchor.name)?.visitTimeProfile;
    check(Boolean(profile), `${anchor.name}: 정밀 체류시간 프로필이 없습니다.`);
    if (!profile) continue;

    const actual: StayRange = [
      profile.stayMinimumMinutes,
      profile.stayTypicalMinutes,
      profile.stayMaximumMinutes,
    ];
    checkStayRange(anchor.name, actual);
    check(
      actual.every((value, index) => value === anchor.expected[index]),
      `${anchor.name}: 공식 이용시간 기반 범위는 ${anchor.expected.join("/")}분이어야 합니다 (현재 ${actual.join("/")}분).`,
    );
  }

  const result = {
    ok: errors.length === 0,
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    acceptance: {
      representativeCases: reports.length,
      nonSparseResults: `비원주 ${recommendationLimit}곳`,
      sparseAllowance: `원주 1~${recommendationLimit}곳`,
      impossibleRecommendations: reports.reduce(
        (sum, report) => sum + report.impossibleCount,
        0,
      ),
      missingVisitTimeProfiles: reports.reduce(
        (sum, report) => sum + report.missingProfileCount,
        0,
      ),
      experienceTypeAnchors: experienceTypeAnchors.length,
      exactStayRangeAnchors: exactStayRangeAnchors.length,
    },
    sparseCases: reports.filter((report) => report.count < recommendationLimit),
    reports,
    errors,
  };

  const output = JSON.stringify(result, null, 2);
  if (errors.length > 0) {
    console.error(output);
    process.exitCode = 1;
  } else {
    console.log(output);
  }
} finally {
  await prisma.$disconnect();
}
