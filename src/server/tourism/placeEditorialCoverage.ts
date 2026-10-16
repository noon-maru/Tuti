export type EditorialCoveragePlace = {
  contentId: string;
  name: string;
  overview: string | null;
  normalizedRawOverview?: string | null;
  usageDuration: string | null;
  hasDetail: boolean;
};

export type EditorialCoverageInputs = {
  summaries: Map<string, string | null>;
  actions: Map<string, string>;
  explicit: Set<string>;
  explicitInputs: Map<string, string>;
};

export function willBeRecommendable(place: {
  candidateOverride: string;
  assessmentStatus: string;
  reviewStatus: string;
  visibilityOverride: string;
  isActive: boolean;
}) {
  const belongsToPool = place.candidateOverride === "include" ||
    (place.candidateOverride === "auto" && place.assessmentStatus === "selected");
  const active = place.visibilityOverride === "auto" ? belongsToPool : place.isActive;
  return belongsToPool && active &&
    (place.reviewStatus === "approved" || place.reviewStatus === "pending");
}

export function checkEditorialCoverage(
  places: EditorialCoveragePlace[],
  inputs: EditorialCoverageInputs,
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const place of places) {
    const label = `${place.name} (${place.contentId})`;
    if (!place.hasDetail) errors.push(`${label}: 관광 원문 상세 레코드 누락`);
    if (!place.overview?.trim() && place.normalizedRawOverview?.trim()) {
      errors.push(`${label}: 저장 원문과 소개 필드 불일치, repair-place-editorial-fields 필요`);
    }
    if (!inputs.summaries.has(place.contentId)) {
      errors.push(`${label}: 요약 입력 누락`);
    } else if (Boolean(place.overview?.trim()) !== Boolean(inputs.summaries.get(place.contentId))) {
      errors.push(`${label}: 원문과 요약의 null 상태 불일치`);
    }
    if (!inputs.actions.has(place.contentId)) errors.push(`${label}: 행동 문구 입력 누락`);
    const duration = normalize(place.usageDuration);
    if (!duration) {
      if (inputs.explicit.has(place.contentId)) {
        warnings.push(`${label}: 현재 체류시간 원문이 없어 이전 구조화 결과를 무시하고 기본 추정값 사용`);
      }
      continue;
    }
    if (!inputs.explicit.has(place.contentId)) {
      errors.push(`${label}: 체류시간 원문에 대응하는 구조화 결과 누락`);
    } else if (!inputs.explicitInputs.has(place.contentId) ||
      normalize(inputs.explicitInputs.get(place.contentId)) !== duration) {
      errors.push(`${label}: 구조화 이후 체류시간 원문 변경 또는 입력 누락`);
    }
  }
  return { errors, warnings };
}

function normalize(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
