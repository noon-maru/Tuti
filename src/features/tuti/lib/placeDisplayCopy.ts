import type { PlaceExperienceType, TutiPlace } from "@/lib/recommendations";

type PlaceCopySource = Pick<TutiPlace, "phrase"> &
  Partial<Pick<TutiPlace, "cardPhrase" | "reason" | "experienceType" | "moodTags">>;

const collectionDefaultPhrases = new Set([
  "잠깐 다른 공기를 만나기 좋은 곳",
  "천천히 둘러보며 다른 감각을 만나는 곳",
  "조금 더 길게 바깥의 흐름을 따라가는 날",
  "몸을 움직이며 공기를 바꿔보고 싶은 날",
]);

const fallbackByExperience: Record<PlaceExperienceType, string> = {
  waterside: "물가에 시선을 두고 천천히 숨을 고르는 시간",
  forest_garden: "초록 사이를 천천히 걸으며 호흡을 고르는 시간",
  art_exhibition: "낯선 장면 앞에서 생각의 방향을 바꾸는 시간",
  museum_story: "한 가지 이야기를 느긋하게 따라가 보는 시간",
  history_heritage: "오래된 시간의 결을 따라 천천히 걷는 날",
  viewpoint: "시선을 멀리 두고 마음의 폭을 넓히는 시간",
  neighborhood: "낯선 동네의 작은 장면을 따라 걷는 시간",
  activity: "가볍게 몸을 움직이며 생각을 비우는 시간",
  wellness: "따뜻한 온기 속에서 몸의 긴장을 늦추는 시간",
  other: "익숙한 하루에서 잠깐 벗어나 보는 시간",
};

export function getPlaceDisplayPhrase(place: PlaceCopySource) {
  const cardPhrase = clean(place.cardPhrase);
  if (cardPhrase) return cardPhrase;

  const reason = clean(place.reason);
  if (reason) return reason;

  const phrase = clean(place.phrase);
  if (phrase && !collectionDefaultPhrases.has(phrase)) return phrase;

  if (place.experienceType) return fallbackByExperience[place.experienceType];
  if (place.moodTags?.includes("quiet")) {
    return "조용한 공기 속에서 잠시 호흡을 고르는 시간";
  }
  if (place.moodTags?.includes("walk")) {
    return "천천히 걸으며 하루의 흐름을 바꾸는 시간";
  }
  return fallbackByExperience.other;
}

export function getPlaceReasonHeadline(place: PlaceCopySource) {
  return clean(place.reason) ?? getPlaceDisplayPhrase(place);
}

function clean(value?: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}
