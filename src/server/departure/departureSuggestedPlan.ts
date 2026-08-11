import type { DeparturePlanStep } from "@/shared/api/departurePlan";
import type {
  TourismPlaceDetail,
  TourismPlaceDetailSection,
} from "@/shared/api/placeDetails";

type SuggestedPlanInput = {
  placeName: string;
  contentTypeId: string | null;
  detail: TourismPlaceDetail | null;
};

type PlaceCharacter = {
  pattern: RegExp;
  title: string;
};

const placeCharacters: PlaceCharacter[] = [
  {
    pattern: /도서관|서점|책|문학관/,
    title: "마음이 가는 책이나 자리에 잠시 머물기",
  },
  {
    pattern: /미술관|박물관|전시|갤러리|기념관/,
    title: "마음이 가는 전시나 공간 한 곳부터 보기",
  },
  {
    pattern: /숲|수목원|휴양림|편백|대나무|생태/,
    title: "숲의 가장 편한 길부터 천천히 걸어보기",
  },
  {
    pattern: /사찰|절|서원|향교|고궁|궁궐|성당|고택/,
    title: "가장 조용한 길부터 천천히 둘러보기",
  },
  {
    pattern: /해변|바다|해안|호수|저수지|강변|수변/,
    title: "물가를 따라 부담 없는 만큼만 걸어보기",
  },
  {
    pattern: /시장|상점|먹거리|골목|거리/,
    title: "끌리는 가게나 골목 한 곳만 골라보기",
  },
  {
    pattern: /전망대|전망|조망|풍경|야경/,
    title: "전망이 트이는 지점까지만 가보기",
  },
  {
    pattern: /둘레길|산책로|탐방로|트레킹|코스|등산로/,
    title: "완주보다 편한 구간 하나만 걸어보기",
  },
  {
    pattern: /공원|정원|광장/,
    title: "마음이 편해지는 자리부터 찾아보기",
  },
];

const usefulSectionPattern =
  /체험|프로그램|전시|관람|코스|시설|주요|볼거리|행사|공연/;
const noticeOnlyPattern = /홈페이지|전화\s*문의|참조|상이하므로|요망/;

export function createDepartureSuggestedPlan({
  placeName,
  contentTypeId,
  detail,
}: SuggestedPlanInput): DeparturePlanStep[] {
  const steps: DeparturePlanStep[] = [];
  const experienceStep = createExperienceStep(detail);
  const characterStep = createCharacterStep(
    placeName,
    contentTypeId,
    detail?.overview ?? null,
  );

  if (experienceStep) steps.push(experienceStep);
  if (characterStep && characterStep.title !== experienceStep?.title) {
    steps.push(characterStep);
  }

  if (steps.length < 2) {
    const supportingStep =
      createDurationStep(detail) ??
      createSectionStep(detail?.sections ?? []) ??
      createOpeningStep(detail);
    if (supportingStep) steps.push(supportingStep);
  }

  if (steps.length === 0) {
    steps.push({
      kind: "arrival",
      title: `${placeName}에서 마음이 가는 곳 하나만 둘러보기`,
      description: "전부 보려 하지 않아도 괜찮아요. 지금 편한 만큼이면 충분해요.",
    });
  }

  return steps.slice(0, 2);
}

function createExperienceStep(
  detail: TourismPlaceDetail | null,
): DeparturePlanStep | null {
  const guide = normalizeText(detail?.experienceGuide);
  if (!guide) return null;

  const option = guide
    .split(/\s*\/\s*|\n+|\s*·\s*/)
    .map((value) => normalizeText(value))
    .find(
      (value): value is string =>
        value !== null && !noticeOnlyPattern.test(value),
    );
  if (!option) return null;

  return {
    kind: "arrival",
    title: `가능하다면 ${clipText(option, 32)} 해보기`,
    description: `이곳에서는 ${clipText(guide, 110)} 같은 경험을 안내하고 있어요.`,
  };
}

function createCharacterStep(
  placeName: string,
  contentTypeId: string | null,
  overview: string | null,
): DeparturePlanStep | null {
  const normalizedOverview = normalizeText(overview);
  const searchable = `${placeName} ${normalizedOverview ?? ""}`;
  const character = placeCharacters.find(({ pattern }) =>
    pattern.test(searchable),
  );
  const title = character?.title ?? getContentTypeFallback(contentTypeId);

  if (!title && !normalizedOverview) return null;

  return {
    kind: "arrival",
    title: title ?? "가장 마음이 가는 공간부터 천천히 둘러보기",
    description: normalizedOverview
      ? findEvidenceSentence(normalizedOverview, character?.pattern)
      : "전부 둘러보기보다 오늘 눈에 들어오는 한 곳이면 충분해요.",
  };
}

function createDurationStep(
  detail: TourismPlaceDetail | null,
): DeparturePlanStep | null {
  const duration = normalizeText(detail?.usageDuration);
  if (!duration) return null;

  return {
    kind: "arrival",
    title: "안내된 시간보다 짧게 머물러도 괜찮아요",
    description: `안내된 이용 시간은 ${clipText(duration, 90)}이에요. 컨디션에 맞춰 줄여도 돼요.`,
  };
}

function createSectionStep(
  sections: TourismPlaceDetailSection[],
): DeparturePlanStep | null {
  const section = sections.find(
    (item) =>
      usefulSectionPattern.test(item.title) &&
      Boolean(normalizeText(item.content)),
  );
  if (!section) return null;

  return {
    kind: "arrival",
    title: `컨디션이 남으면 ‘${clipText(section.title, 28)}’ 살펴보기`,
    description: clipText(normalizeText(section.content) ?? "", 110),
  };
}

function createOpeningStep(
  detail: TourismPlaceDetail | null,
): DeparturePlanStep | null {
  const openingHours = normalizeText(detail?.openingHours);
  const restDate = normalizeText(detail?.restDate);
  if (!openingHours && !restDate) return null;

  return {
    kind: "arrival",
    title: "운영시간 안에서 서두르지 않고 머물기",
    description: [
      openingHours ? `이용 ${clipText(openingHours, 70)}` : null,
      restDate ? `쉬는 날 ${clipText(restDate, 50)}` : null,
    ].filter(Boolean).join(" · "),
  };
}

function getContentTypeFallback(contentTypeId: string | null) {
  if (contentTypeId === "14") {
    return "마음이 가는 전시나 공간 한 곳부터 보기";
  }
  if (contentTypeId === "25") {
    return "처음부터 끝까지보다 편한 구간만 경험하기";
  }
  if (contentTypeId === "28") {
    return "오늘 가능한 활동 하나만 골라보기";
  }
  if (contentTypeId === "12") {
    return "가장 마음이 가는 공간부터 천천히 둘러보기";
  }
  return null;
}

function findEvidenceSentence(text: string, pattern?: RegExp) {
  const sentences = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter((sentence): sentence is string => Boolean(sentence));
  const matched = pattern
    ? sentences.find((sentence) => pattern.test(sentence))
    : undefined;
  return clipText(matched ?? sentences[0] ?? text, 120);
}

function normalizeText(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  const boundary = lastSpace >= Math.floor(maxLength * 0.6)
    ? lastSpace
    : maxLength;
  return `${clipped.slice(0, boundary).trim()}…`;
}
