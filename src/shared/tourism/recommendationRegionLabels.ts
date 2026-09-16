import { getTourApiAreaCode } from "@/shared/tourism/tourApiRegions";

const integratedGwangjuDistricts = new Set([
  "광산구",
  "남구",
  "동구",
  "북구",
  "서구",
]);

const shortRegionNames: Record<string, string> = {
  서울특별시: "서울",
  인천광역시: "인천",
  대전광역시: "대전",
  대구광역시: "대구",
  광주광역시: "광주",
  부산광역시: "부산",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  경상북도: "경북",
  경상남도: "경남",
  전북특별자치도: "전북",
  전라남도: "전남",
  제주특별자치도: "제주",
};

export function getPublicRecommendationSidoName(
  storedSidoName: string,
  sigunguName: string | null,
) {
  if (storedSidoName !== "전남광주통합특별시") return storedSidoName;
  return sigunguName && integratedGwangjuDistricts.has(sigunguName)
    ? "광주광역시"
    : "전라남도";
}

export function getRecommendationRegionIdentity(
  storedSidoName: string,
  sigunguName: string | null,
) {
  const name = getPublicRecommendationSidoName(storedSidoName, sigunguName);
  const areaCode = getTourApiAreaCode(name);
  if (!areaCode) return null;
  return {
    areaCode,
    name,
    shortName: shortRegionNames[name] ?? name,
  };
}

export function isIntegratedGwangjuDistrict(name: string) {
  return integratedGwangjuDistricts.has(name);
}
