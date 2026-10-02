import type { PlaceExperienceType, TutiPlace } from "@/lib/recommendations";

type ExperienceTypeInput = Pick<TutiPlace, "name" | "phrase" | "note" | "sourceContentType" | "moodTags"> & {
  overview?: string | null;
  experienceGuide?: string | null;
};

export type PlaceExperienceTypeAssessment = {
  type: PlaceExperienceType;
  confidence: number;
  evidence: string[];
};

type Rule = { type: PlaceExperienceType; pattern: RegExp; label: string };

// 일반 명칭으로 정체를 알 수 없는 브랜드형 장소만 정규화된 전체 이름으로 제한한다.
const identityOverrides: Rule[] = [
  {
    type: "art_exhibition",
    pattern: /^하리보\s+해피월드(?:\s+인\s+제주)?$/u,
    label: "전시 브랜드 명칭",
  },
];

// 고유한 시설명이 일반적인 설명 문장보다 장소의 정체성을 더 잘 나타낸다.
// 복합 시설명은 더 구체적인 활동·시설 용도를 일반적인 자연 환경보다 우선한다.
const identityRules: Rule[] = [
  { type: "wellness", pattern: /온천|스파|찜질|사우나|목욕탕|해수탕|해수랜드|힐링원|치유센터|치유의숲/u, label: "온천·회복 명칭" },
  { type: "activity", pattern: /워터파크|물놀이장|수영장|체험장|레포츠|레저|스포츠|체육|놀이공원|미로|승마|목장|캠핑|클라이밍/u, label: "활동 명칭" },
  { type: "art_exhibition", pattern: /미술관|갤러리|화랑(?:\s*\([^)]*\))?$|전시관|아트센터|예술회관|예술관|공연장|극장/u, label: "예술·전시 명칭" },
  { type: "museum_story", pattern: /문화원|책방|서점|박물관|뮤지엄|과학관|기념관|기념(?!품)[^()]{0,20}센터|역사관|홍보관|문학관|생태관|천문대|도서관/u, label: "문화·박물관 명칭" },
  { type: "history_heritage", pattern: /감영|관아|궁\b|성곽|산성|유적|사적|고분|서원|향교|사찰|암자|성당|생가|고택|성지|기념비|노래비|사당(?:\s*\([^)]*\))?$|[가-힣]{2,}사(?:\s*\([^)]*\))?$/u, label: "역사·유산 명칭" },
  { type: "viewpoint", pattern: /전망대|스카이|타워|봉수대|일출|야경|전망|^[가-힣·-]{1,20}(?:(?<!동)산|봉)(?:\s*\([^)]*\))?$/u, label: "전망·산 명칭" },
  { type: "waterside", pattern: /해수욕장|해변|바다|해안|항구|포구|섬|한강|강변|수변|호수|저수지|계곡|폭포|습지/u, label: "수변 명칭" },
  { type: "forest_garden", pattern: /수목원|정원|휴양림|생태공원|근린공원|공원|숲|둘레길|산책로|오름/u, label: "자연·정원 명칭" },
  { type: "neighborhood", pattern: /전통시장|시장|골목|거리|벽화마을|상점가|마을/u, label: "동네·시장 명칭" },
];

const descriptionRules: Rule[] = [
  { type: "wellness", pattern: /온천욕|스파 시설|찜질|치유 프로그램|산림 치유/u, label: "온천·회복 설명" },
  { type: "forest_garden", pattern: /산책하기|산책로|숲길|수목원|정원|휴양림|생태공원/u, label: "자연·산책 설명" },
  { type: "waterside", pattern: /해변|해수욕장|해안 산책|바다를|호수 주변|강변|계곡|폭포|습지/u, label: "수변 설명" },
  { type: "viewpoint", pattern: /전망을|조망할|내려다보|일출|야경 명소/u, label: "전망 설명" },
  { type: "art_exhibition", pattern: /미술 작품|기획 전시|전시 공간|공연 예술/u, label: "예술·전시 설명" },
  { type: "museum_story", pattern: /유물을|상설 전시|자료를 전시|박물관|과학관/u, label: "박물관·이야기 설명" },
  { type: "history_heritage", pattern: /문화재|역사적|유적으로|사적 제|전통 건축/u, label: "역사·유산 설명" },
  { type: "activity", pattern: /직접 체험|레저 활동|스포츠를|장비를 대여/u, label: "활동 설명" },
  { type: "neighborhood", pattern: /전통시장|골목을|상점가|마을 풍경/u, label: "동네·시장 설명" },
];

export function assessPlaceExperienceType(place: ExperienceTypeInput): PlaceExperienceTypeAssessment {
  const normalizedName = normalize(place.name);
  const overridden = identityOverrides.find((rule) => rule.pattern.test(normalizedName));
  if (overridden) {
    return {
      type: overridden.type,
      confidence: 100,
      evidence: [`장소명: ${overridden.label}`],
    };
  }
  if (/대교|해안도로|일주도로|관광안내소|탐방안내소/u.test(normalizedName)) {
    return {
      type: /전망대|전시관|홍보관|공원/u.test(normalizedName)
        ? "viewpoint"
        : "other",
      confidence: 85,
      evidence: ["장소명: 체류 지점이 불분명한 이동·안내 시설"],
    };
  }
  const identity = identityRules.find((rule) => rule.pattern.test(normalizedName));
  if (identity) return { type: identity.type, confidence: 95, evidence: [`장소명: ${identity.label}`] };

  const contentType = fromContentType(place.sourceContentType);
  const description = normalize([place.overview, place.experienceGuide].filter(Boolean).join(" "));
  const described = descriptionRules.find((rule) => rule.pattern.test(description));
  if (described) {
    return {
      type: described.type,
      confidence: contentType === described.type ? 88 : 78,
      evidence: [`공식 설명: ${described.label}`, ...(contentType === described.type ? ["관광 유형 일치"] : [])],
    };
  }
  if (contentType) return { type: contentType, confidence: 45, evidence: ["한국관광공사 관광 유형"] };
  return { type: "other", confidence: 20, evidence: ["구체적인 유형 근거 없음"] };
}

export function derivePlaceExperienceType(place: ExperienceTypeInput) {
  return assessPlaceExperienceType(place).type;
}

export function getPlaceExperienceType(place: TutiPlace) {
  return place.experienceType ?? derivePlaceExperienceType(place);
}

function fromContentType(contentType?: string | null): PlaceExperienceType | null {
  if (contentType === "28") return "activity";
  if (contentType === "38") return "neighborhood";
  if (contentType === "14") return "other";
  return null;
}

function normalize(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
