export type PlaceCandidateStatus =
  | "selected"
  | "enrich"
  | "pending"
  | "low_burden_mismatch"
  | "invalid";

export type PlaceCandidateInput = {
  id: string;
  name: string;
  image: string;
  fatigue: number;
  movementLevel: "near" | "short" | "half";
  moodTags: string[];
  latitude: number;
  longitude: number;
  contentTypeId: string | null;
  address: string | null;
  sidoName: string | null;
  sigunguName: string | null;
  copyright: string | null;
  hasWellnessSource: boolean;
  hasCoreTourismSource: boolean;
  hasSeoulRealtimeArea: boolean;
  detail: {
    synced: boolean;
    overview: string | null;
    openingHours: string | null;
    restDate: string | null;
    reservation: string | null;
    usageDuration: string | null;
    experienceGuide: string | null;
    imageCount: number;
  } | null;
};

export type PlaceCandidateAssessment = {
  status: PlaceCandidateStatus;
  score: number;
  sections: {
    tutiFit: number;
    executionEase: number;
    dataConfidence: number;
    recommendationUtility: number;
  };
  reasons: string[];
  hardExclusions: string[];
};

export const PLACE_CANDIDATE_ALGORITHM_VERSION = "low-burden-v1";

const SELECTED_SCORE = 70;
const ENRICH_SCORE = 55;

const restorativePattern =
  /숲|수목원|휴양림|정원|공원|생태|습지|호수|저수지|연못|강변|해변|바다|수변|산책|둘레길|올레길|데크길|숲길|치유|명상|전망|사찰|절|성당|교회|서원|고택|한옥|섬|계곡|폭포|동굴/u;
const culturePattern =
  /미술관|박물관|도서관|전시|갤러리|문화관|문화원|문학관|기념관|역사관|과학관|천문대|공방|예술|극장|공연장/u;
const highBarrierPattern =
  /골프|스키|스노보드|승마|사격|래프팅|서바이벌|번지|패러글라이딩|ATV|수상레저|요트|카트|낚시|캠핑|야영장|오토캠핑|글램핑/u;
const reservationPattern =
  /예약제|사전\s*예약|회원제|체험\s*예약|장비\s*대여|입장권\s*예매/u;
const closedPattern = /폐업|영구\s*폐쇄|운영\s*종료|휴업\s*중/u;

export function assessPlaceCandidate(
  place: PlaceCandidateInput,
): PlaceCandidateAssessment {
  const hardExclusions = findHardExclusions(place);
  const reasons: string[] = [];
  const searchable = [place.name, place.detail?.overview]
    .filter(Boolean)
    .join(" ");

  const tutiFit = scoreTutiFit(place, searchable, reasons);
  const executionEase = scoreExecutionEase(place, searchable, reasons);
  const dataConfidence = scoreDataConfidence(place, reasons);
  const recommendationUtility = scoreRecommendationUtility(place, reasons);
  const score = hardExclusions.length > 0
    ? 0
    : tutiFit + executionEase + dataConfidence + recommendationUtility;
  const hasHighActivityBurden = reasons.includes(
    "실행 부담: 준비·활동 부담이 큰 경험",
  );

  return {
    status: hardExclusions.length > 0
      ? "invalid"
      : hasHighActivityBurden && executionEase < 12
        ? "low_burden_mismatch"
        : score >= SELECTED_SCORE
          ? "selected"
          : score >= ENRICH_SCORE
            ? "enrich"
            : "pending",
    score,
    sections: {
      tutiFit,
      executionEase,
      dataConfidence,
      recommendationUtility,
    },
    reasons,
    hardExclusions,
  };
}

function findHardExclusions(place: PlaceCandidateInput) {
  const exclusions: string[] = [];

  if (!place.name.trim()) exclusions.push("필수 정보: 장소명 없음");
  if (!place.image.trim()) exclusions.push("필수 정보: 대표 이미지 없음");
  if (
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude) ||
    (place.latitude === 0 && place.longitude === 0)
  ) {
    exclusions.push("필수 정보: 유효 좌표 없음");
  }
  if (closedPattern.test(`${place.name} ${place.detail?.overview ?? ""}`)) {
    exclusions.push("운영 상태: 폐업·종료 표현");
  }

  return exclusions;
}

function scoreTutiFit(
  place: PlaceCandidateInput,
  searchable: string,
  reasons: string[],
) {
  let score = 4;

  if (place.hasWellnessSource) {
    score += 18;
    reasons.push("Tuti 적합성: 웰니스 관광지 연계");
  }
  if (restorativePattern.test(searchable)) {
    score += 16;
    reasons.push("Tuti 적합성: 자연·산책·회복 맥락");
  }
  if (culturePattern.test(searchable)) {
    score += 12;
    reasons.push("Tuti 적합성: 조용한 문화 경험 맥락");
  }
  if (place.moodTags.includes("solitude")) score += 5;
  if (place.moodTags.includes("quiet")) score += 3;
  if (place.moodTags.includes("walk")) score += 3;

  if (place.contentTypeId === "14") score += 5;
  if (place.contentTypeId === "12") score += 3;

  return clamp(score, 0, 40);
}

function scoreExecutionEase(
  place: PlaceCandidateInput,
  searchable: string,
  reasons: string[],
) {
  let score = place.movementLevel === "near"
    ? 24
    : place.movementLevel === "short"
      ? 20
      : 12;

  if (place.fatigue <= 30) score += 4;
  else if (place.fatigue <= 40) score += 2;
  else if (place.fatigue > 55) score -= 4;

  if (highBarrierPattern.test(searchable)) {
    score -= 16;
    reasons.push("실행 부담: 준비·활동 부담이 큰 경험");
  }
  if (
    reservationPattern.test(
      `${searchable} ${place.detail?.reservation ?? ""} ${place.detail?.experienceGuide ?? ""}`,
    )
  ) {
    score -= 6;
    reasons.push("실행 부담: 예약·장비 준비 가능성");
  }
  if (place.contentTypeId === "28") score -= 5;
  if (place.contentTypeId === "25") score -= 2;

  if (score >= 20) reasons.push("실행 부담: 비교적 가벼운 이동·활동");
  return clamp(score, 0, 25);
}

function scoreDataConfidence(
  place: PlaceCandidateInput,
  reasons: string[],
) {
  let score = 4;

  if (place.address) score += 3;
  if (place.copyright) score += 2;
  if (place.hasCoreTourismSource) score += 5;
  if (place.hasWellnessSource) score += 3;
  if (place.detail?.synced) score += 2;
  if (place.detail?.overview) score += 2;
  if ((place.detail?.imageCount ?? 0) > 0) score += 2;

  if (score >= 14) reasons.push("데이터 신뢰도: 교차 데이터·상세 정보 확보");
  else if (!place.detail?.synced) reasons.push("정보 보강: 상세 정보 미수집");

  return clamp(score, 0, 20);
}

function scoreRecommendationUtility(
  place: PlaceCandidateInput,
  reasons: string[],
) {
  let score = 2;

  if (place.hasSeoulRealtimeArea) {
    score += 6;
    reasons.push("추천 활용성: 서울 실시간 혼잡도 연계");
  }
  if (place.hasCoreTourismSource) {
    score += 4;
    reasons.push("추천 활용성: 중심 관광지 수요 데이터 연계");
  }
  if (place.detail?.openingHours || place.detail?.restDate) score += 2;
  if (place.detail?.usageDuration) score += 2;
  if (place.sidoName && place.sigunguName) score += 1;

  return clamp(score, 0, 15);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
