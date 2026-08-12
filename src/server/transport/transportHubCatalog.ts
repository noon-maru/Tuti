import type { KakaoPlaceSearchResult } from "@/server/maps/kakaoMapClient";

export type TransportHubDefinition = {
  mode: "rail" | "express_bus";
  sourceNames: readonly string[];
  query: string;
  acceptedNames?: readonly string[];
  regionPrefixes: readonly string[];
};

const HIGH_SPEED_RAIL_SOURCE_NAMES = [
  "행신", "서울", "용산", "광명", "청량리", "상봉", "수서",
  "천안아산", "오송", "대전", "서대전", "공주", "익산", "정읍",
  "광주송정", "나주", "목포", "전주", "남원", "곡성", "구례구",
  "순천", "여천", "여수엑스포", "김천구미", "동대구", "경주",
  "울산", "부산", "구포", "밀양", "창원중앙", "창원", "마산",
  "진주", "포항", "강릉", "만종", "횡성", "둔내", "평창",
  "진부", "정동진", "묵호", "동해", "원주", "제천", "단양",
  "풍기", "영주", "안동", "부전",
] as const;

const normalizedHighSpeedRailNames = new Set(
  HIGH_SPEED_RAIL_SOURCE_NAMES.map(normalizeTransportHubName),
);

export const EXPRESS_BUS_HUB_DEFINITIONS = [
  bus("서울경부", "서울고속버스터미널", ["서울"]),
  bus("센트럴시티(서울)", "센트럴시티터미널", ["서울"]),
  bus("동서울", "동서울종합터미널", ["서울"]),
  bus("서울남부", "서울남부터미널", ["서울"]),
  bus("인천", "인천종합터미널", ["인천"]),
  bus("수원", "수원버스터미널", ["경기"]),
  bus("성남", "성남종합버스터미널", ["경기"]),
  bus("고양백석", "고양종합터미널", ["경기"]),
  bus("용인", "용인공용버스터미널", ["경기"]),
  bus("의정부", "의정부시외버스터미널", ["경기"]),
  bus("강릉", "강릉고속버스터미널", ["강원"]),
  bus("속초", "속초고속버스터미널", ["강원"]),
  bus("춘천", "춘천고속버스터미널", ["강원"]),
  bus("원주", "원주고속버스터미널", ["강원"]),
  bus("천안", "천안고속버스터미널", ["충남"]),
  bus("대전복합", "대전복합터미널", ["대전"]),
  bus("청주(고속)", "청주고속버스터미널", ["충북"]),
  bus("세종터미널", "세종고속시외버스터미널", ["세종"]),
  bus("공주", "공주종합버스터미널", ["충남"]),
  bus("전주", "전주고속버스터미널", ["전북"]),
  bus("군산", "군산고속버스터미널", ["전북"]),
  bus("익산", "익산고속버스터미널", ["전북"]),
  bus("광주(유·스퀘어)", "유스퀘어 광주종합버스터미널", ["광주", "전남광주"]),
  bus("목포", "목포종합버스터미널", ["전남", "전남광주"]),
  bus("순천", "순천종합버스터미널", ["전남", "전남광주"]),
  bus("여수", "여수종합버스터미널", ["전남", "전남광주"]),
  bus("동대구", "동대구터미널", ["대구"]),
  bus("경주", "경주고속버스터미널", ["경북"]),
  bus("포항", "포항고속버스터미널", ["경북"]),
  bus("부산", "부산종합버스터미널", ["부산"]),
  bus("부산사상", "부산서부버스터미널", ["부산"]),
  bus("울산", "울산고속버스터미널", ["울산"]),
  bus("창원", "창원종합버스터미널", ["경남"]),
  bus("마산", "마산고속버스터미널", ["경남"]),
  bus("진주", "진주고속버스터미널", ["경남"]),
  bus("김해", "김해여객터미널", ["경남"]),
] as const satisfies readonly TransportHubDefinition[];

export function isSupportedHighSpeedRailHub(sourceName: string) {
  return normalizedHighSpeedRailNames.has(
    normalizeTransportHubName(sourceName),
  );
}

export function createRailHubDefinition(
  sourceName: string,
  cityName: string,
): TransportHubDefinition {
  return {
    mode: "rail",
    sourceNames: [sourceName],
    query: `${cityName} ${sourceName}역`,
    regionPrefixes: getRegionPrefixes(cityName),
  };
}

export function findExpressBusHubDefinition(sourceName: string) {
  const normalized = normalizeTransportHubName(sourceName);
  return EXPRESS_BUS_HUB_DEFINITIONS.find((definition) =>
    definition.sourceNames.some(
      (candidate) => normalizeTransportHubName(candidate) === normalized,
    ),
  );
}

export function selectKakaoHubCandidate(
  definition: TransportHubDefinition,
  candidates: KakaoPlaceSearchResult[],
) {
  const expectedNames = [
    ...definition.sourceNames,
    ...(definition.acceptedNames ?? []),
    definition.query,
  ].map(normalizeTransportHubName);

  return candidates.find((candidate) => {
    if (!isExpectedCategory(definition.mode, candidate.categoryName)) {
      return false;
    }
    if (!hasExpectedRegion(candidate.address, definition.regionPrefixes)) {
      return false;
    }

    const candidateName = normalizeTransportHubName(candidate.name);
    return expectedNames.some(
      (expected) =>
        candidateName === expected ||
        candidateName.includes(expected) ||
        expected.includes(candidateName),
    );
  });
}

export function normalizeTransportHubName(value: string) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replaceAll("expo", "엑스포")
    .replaceAll("오대산", "")
    .replace(/[()\s·.역-]/g, "")
    .replace(/고속|시외|종합|공용|버스|터미널/g, "");
}

function bus(
  sourceName: string,
  officialName: string,
  regionPrefixes: readonly string[],
): TransportHubDefinition {
  return {
    mode: "express_bus",
    sourceNames: [sourceName],
    query: officialName,
    acceptedNames: [officialName],
    regionPrefixes,
  };
}

function isExpectedCategory(
  mode: TransportHubDefinition["mode"],
  categoryName: string | null,
) {
  if (!categoryName) return false;
  if (/폐역/.test(categoryName)) return false;
  return mode === "rail"
    ? /기차,철도[^>]*>\s*기차역|KTX|SRT/.test(categoryName)
    : /고속,시외버스터미널/.test(categoryName);
}

function hasExpectedRegion(
  address: string | null,
  regionPrefixes: readonly string[],
) {
  if (!address) return false;
  return regionPrefixes.some((prefix) => address.startsWith(prefix));
}

function getRegionPrefixes(cityName: string) {
  const prefixes: Record<string, readonly string[]> = {
    서울특별시: ["서울"],
    부산광역시: ["부산"],
    대구광역시: ["대구"],
    인천광역시: ["인천"],
    광주광역시: ["광주", "전남광주"],
    대전광역시: ["대전"],
    울산광역시: ["울산"],
    세종특별시: ["세종"],
    경기도: ["경기"],
    강원도: ["강원"],
    충청북도: ["충북"],
    충청남도: ["충남"],
    전라북도: ["전북"],
    전라남도: ["전남", "전남광주"],
    경상북도: ["경북"],
    경상남도: ["경남"],
    제주특별자치도: ["제주"],
  };
  return prefixes[cityName] ?? [cityName];
}
