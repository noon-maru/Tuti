import type { PlaceExperienceType, TutiPlace } from "@/lib/recommendations";

type ExperienceTypeInput = Pick<
  TutiPlace,
  "name" | "phrase" | "note" | "sourceContentType" | "moodTags"
> & {
  overview?: string | null;
  experienceGuide?: string | null;
};

export function derivePlaceExperienceType(
  place: ExperienceTypeInput,
): PlaceExperienceType {
  const text = [
    place.name,
    place.phrase,
    place.note,
    place.overview,
    place.experienceGuide,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]+>/g, " ");

  if (/전망|전망대|스카이|케이블카|타워|봉수대|일출|야경/.test(text)) {
    return "viewpoint";
  }
  if (/해변|해수욕장|바다|해안|항구|포구|섬|강변|한강|호수|저수지|계곡|폭포|습지/.test(text)) {
    return "waterside";
  }
  if (/미술관|갤러리|전시관|아트|예술|공연|극장|문화회관/.test(text)) {
    return "art_exhibition";
  }
  if (/박물관|과학관|기념관|홍보관|문학관|생태관|천문대/.test(text)) {
    return "museum_story";
  }
  if (/궁|성곽|산성|유적|사적|고분|서원|향교|사찰|절|성당|교회|생가|기념비|노래비/.test(text)) {
    return "history_heritage";
  }
  if (/체험|레저|스포츠|체육|놀이|미로|승마|목장|캠핑|수상|클라이밍/.test(text)) {
    return "activity";
  }
  if (/시장|골목|거리|마을|벽화|상점가|전통시장/.test(text)) {
    return "neighborhood";
  }
  if (/공원|숲|수목원|정원|휴양림|산\b|둘레길|산책로|오름|생태공원/.test(text)) {
    return "forest_garden";
  }
  if (place.sourceContentType === "28") return "activity";
  if (place.sourceContentType === "38") return "neighborhood";
  if (place.sourceContentType === "14") return "museum_story";
  if (place.moodTags.includes("walk") || place.moodTags.includes("open")) {
    return "forest_garden";
  }
  return "other";
}

export function getPlaceExperienceType(place: TutiPlace) {
  return place.experienceType ?? derivePlaceExperienceType(place);
}
