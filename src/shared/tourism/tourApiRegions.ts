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

const tourApiLegalDongSidoNames: Record<string, string> = {
  "11": "서울특별시",
  "12": "전남광주통합특별시",
  "26": "부산광역시",
  "27": "대구광역시",
  "28": "인천광역시",
  "29": "광주광역시",
  "30": "대전광역시",
  "31": "울산광역시",
  "36": "세종특별자치시",
  "36110": "세종특별자치시",
  "41": "경기도",
  "43": "충청북도",
  "44": "충청남도",
  "46": "전라남도",
  "47": "경상북도",
  "48": "경상남도",
  "50": "제주특별자치도",
  "51": "강원특별자치도",
  "52": "전북특별자치도",
};

const addressSidoAliases: Record<string, string> = {
  서울: "서울특별시",
  서울특별시: "서울특별시",
  부산: "부산광역시",
  부산광역시: "부산광역시",
  대구: "대구광역시",
  대구광역시: "대구광역시",
  인천: "인천광역시",
  인천광역시: "인천광역시",
  광주: "광주광역시",
  광주광역시: "광주광역시",
  대전: "대전광역시",
  대전광역시: "대전광역시",
  울산: "울산광역시",
  울산광역시: "울산광역시",
  세종: "세종특별자치시",
  세종특별자치시: "세종특별자치시",
  경기: "경기도",
  경기도: "경기도",
  강원: "강원특별자치도",
  강원특별자치도: "강원특별자치도",
  충북: "충청북도",
  충청북도: "충청북도",
  충남: "충청남도",
  충청남도: "충청남도",
  전북: "전북특별자치도",
  전북특별자치도: "전북특별자치도",
  전남: "전라남도",
  전라남도: "전라남도",
  경북: "경상북도",
  경상북도: "경상북도",
  경남: "경상남도",
  경상남도: "경상남도",
  제주: "제주특별자치도",
  제주특별자치: "제주특별자치도",
  제주특별자치도: "제주특별자치도",
  전남광주통특별시: "전남광주통합특별시",
  전남광주통합특별시: "전남광주통합특별시",
};

export const tourApiSidoOptions = Object.entries(tourApiSidoNames);

export function resolveTourApiRegionLabels(
  areaCode: string | null,
  address: string | null,
  legalDongRegionCode?: string | null,
) {
  const normalizedLegalDongRegionCode = legalDongRegionCode?.trim() || null;
  const normalizedAreaCode = areaCode?.trim() || null;
  const sidoName =
    (normalizedLegalDongRegionCode
      ? tourApiLegalDongSidoNames[normalizedLegalDongRegionCode]
      : null) ??
    (normalizedAreaCode ? tourApiSidoNames[normalizedAreaCode] : null) ??
    resolveSidoName(address);
  const sigunguName = resolveSigunguName(address, sidoName);

  return { sidoName, sigunguName };
}

function resolveSidoName(address: string | null) {
  const firstPart = address?.trim().split(/\s+/, 1)[0];
  return firstPart ? addressSidoAliases[firstPart] ?? null : null;
}

function resolveSigunguName(address: string | null, sidoName: string | null) {
  if (!address || !sidoName) return null;

  const parts = address.split(/\s+/).filter(Boolean);
  const sidoIndex = parts.findIndex(
    (part) => part === sidoName || addressSidoAliases[part] === sidoName,
  );
  const candidates = parts.slice(sidoIndex >= 0 ? sidoIndex + 1 : 0);

  for (const candidate of candidates) {
    const match = candidate.match(/^(.+?(?:시|군|구))/);
    if (match?.[1]) return match[1];
  }

  return null;
}
