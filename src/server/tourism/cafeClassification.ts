export const CAFE_CATEGORY_CODES = ["FD050100", "FD050200"] as const;
export type CafeCategoryCode = (typeof CAFE_CATEGORY_CODES)[number];
export type CafeSource = {
  name: string;
  contentTypeId?: string | null;
  categoryCode?: string | null;
  legacyCategoryCode?: string | null;
  overview?: string | null;
};
export type CafeClassification = {
  kind: "venue" | "related" | "ambiguous" | "unrelated";
  evidence: string;
};

const relatedName = /카페리|(?:카페|커피)\s*거리|박물관|뮤지엄|농장|농원|캠핑|카라반|글램핑|터미널|산책로|정원|공원|박람회|페어|투어.*코스|족욕|알파카|동물|체험카페|도자기마을/u;
const cafeName = /카페(?!리)|까페|찻집|티하우스|다방|\bcaf[eé]\b/iu;
const coffeeName = /커피|\bcoffee\b/iu;
const clean = (text: string) => text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function classifyCafe(source: CafeSource): CafeClassification {
  const name = clean(source.name);
  // '산소카페 청송정원', 카페거리, 커피박물관은 카페 매장이 아니다.
  if (relatedName.test(name)) {
    return { kind: cafeName.test(name) || coffeeName.test(name) ? "related" : "unrelated", evidence: "시설명은 거리·관광·체험 시설을 가리킴" };
  }
  if (CAFE_CATEGORY_CODES.includes(source.categoryCode as CafeCategoryCode)) {
    return { kind: "venue", evidence: "관광공사 신분류 카페·찻집" };
  }
  // 새 분류가 있으면 예전 통합 분류보다 우선한다. 기타음료점·식당은 자동 편입하지 않는다.
  if (source.contentTypeId === "39" && source.categoryCode) {
    return { kind: "unrelated", evidence: "카페·찻집 외 음식점 신분류" };
  }
  if (source.contentTypeId === "39" && source.legacyCategoryCode === "A05020900") {
    return { kind: "venue", evidence: "관광공사 구분류 카페/전통찻집" };
  }
  if (cafeName.test(name)) return { kind: "venue", evidence: "카페·찻집 시설명" };
  if (coffeeName.test(name)) {
    const firstSentence = clean(source.overview ?? "").split(/[.!?。]/u)[0] ?? "";
    if (!/주변|인근/u.test(firstSentence) && /카페|찻집/u.test(firstSentence)) {
      return { kind: "venue", evidence: "커피 시설명과 공식 소개 첫 문장의 카페 설명" };
    }
    return { kind: "ambiguous", evidence: "커피 명칭만으로 매장·공장·체험장을 구분할 수 없음" };
  }
  return { kind: "unrelated", evidence: "카페·찻집 근거 없음" };
}

export function cafeCategoryFromPayload(payload: unknown) {
  const row = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
  return {
    categoryCode: typeof row.lclsSystm3 === "string" ? row.lclsSystm3 : null,
    legacyCategoryCode: typeof row.cat3 === "string" ? row.cat3 : null,
  };
}
