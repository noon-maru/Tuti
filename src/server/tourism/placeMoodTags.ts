export type PlaceMoodTag = "quiet" | "open" | "walk" | "solitude";

export type PlaceMoodTagSource = {
  name: string;
  address?: string | null;
  contentTypeId?: string | null;
  overview?: string | null;
  experienceGuide?: string | null;
};

const quietPattern =
  /조용|고요|한적|호젓|고즈넉|평온|사색|명상|치유|휴식|쉼|도서관|서원|고택|사찰|암자|수목원|휴양림/u;
const quietConflictPattern =
  /시장|축제|공연|콘서트|놀이공원|테마파크|워터파크|경기장|쇼핑|번화가|유흥|아쿠아리움|수족관|동물원|유원지|키즈|어린이(?:대공원|박물관|체험|도서관)|공룡박물관|고래박물관|교통문화(?:연수원|체험관)|온천(?:센터|장|테마)|스파|찜질/u;
const calmCulturePattern =
  /도서관|미술관|박물관|문학관|기념관|서원|고택|사찰|암자/u;
const openPattern =
  /탁\s*트|트인|조망|전망|파노라마|광장|해변|해수욕장|바다|해안|호수|저수지|강변|하천|수변|습지|들판|초원|공원|정상|전망대/u;
const indoorPattern =
  /실내|박물관|미술관|도서관|전시관|문화관|문화회관|예술회관|기념관|과학관|공연장|극장|아트홀|콘서트홀|갤러리|화랑|체험관|아쿠아리움/u;
const walkPattern =
  /걷|산책|산책로|둘레길|올레길|데크길|숲길|탐방로|보행|트레킹|등산로|오솔길|골목|정원|수목원|휴양림|강변|해변|해안길|공원/u;
const walkConflictPattern =
  /드라이브|유람선|케이블카|모노레일|ATV|카트|래프팅|패러글라이딩/u;
const solitudePattern =
  /혼자|한적|호젓|고요|사색|명상|암자|오솔길|숨은|인적이 드문/u;

/**
 * 장소 유형만으로 성격을 추측하지 않고, 이름과 공식 상세 설명에 확인되는
 * 특성이 있을 때만 추천 태그를 부여한다.
 */
export function derivePlaceMoodTags(
  source: PlaceMoodTagSource,
): PlaceMoodTag[] {
  const normalizedName = source.name
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const searchable = [
    source.name,
    source.address,
    source.overview,
    source.experienceGuide,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const tags = new Set<PlaceMoodTag>();

  const explicitlyQuiet =
    quietPattern.test(searchable) ||
    (source.contentTypeId === "14" && calmCulturePattern.test(searchable));
  if (
    explicitlyQuiet &&
    source.contentTypeId !== "28" &&
    !quietConflictPattern.test(searchable)
  ) {
    tags.add("quiet");
  }

  const explicitlyOpen = openPattern.test(searchable);
  const culturalOpenEvidenceMissing =
    source.contentTypeId === "14" && !openPattern.test(normalizedName);
  if (
    explicitlyOpen &&
    !indoorPattern.test(searchable) &&
    !culturalOpenEvidenceMissing
  ) {
    tags.add("open");
  }

  const culturalWalkEvidenceMissing =
    source.contentTypeId === "14" && !walkPattern.test(normalizedName);
  if (
    walkPattern.test(searchable) &&
    !walkConflictPattern.test(searchable) &&
    !indoorPattern.test(searchable) &&
    !culturalWalkEvidenceMissing
  ) {
    tags.add("walk");
  }

  if (
    tags.has("quiet") &&
    solitudePattern.test(searchable) &&
    source.contentTypeId !== "28"
  ) {
    tags.add("solitude");
  }

  return [...tags];
}
