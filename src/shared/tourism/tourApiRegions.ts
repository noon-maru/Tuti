const tourApiSidoNames: Record<string, string> = {
  "1": "서울특별시",
  "2": "인천광역시",
  "3": "대전광역시",
  "4": "대구광역시",
  "5": "광주광역시",
  "6": "부산광역시",
  "7": "울산광역시",
  "8": "세종특별자치시",
  "31": "경기도",
  "32": "강원특별자치도",
  "33": "충청북도",
  "34": "충청남도",
  "35": "경상북도",
  "36": "경상남도",
  "37": "전북특별자치도",
  "38": "전라남도",
  "39": "제주특별자치도",
};

export const tourApiSidoOptions = Object.entries(tourApiSidoNames);

export function resolveTourApiRegionLabels(
  areaCode: string | null,
  address: string | null,
) {
  const sidoName = areaCode ? tourApiSidoNames[areaCode] ?? null : null;
  const sigunguName = resolveSigunguName(address, sidoName);

  return { sidoName, sigunguName };
}

function resolveSigunguName(address: string | null, sidoName: string | null) {
  if (!address || !sidoName) return null;

  const parts = address.split(/\s+/).filter(Boolean);
  const sidoIndex = parts.findIndex((part) => part === sidoName);
  const candidates = parts.slice(sidoIndex >= 0 ? sidoIndex + 1 : 0);

  return candidates.find((part) => /(?:시|군|구)$/.test(part)) ?? null;
}
