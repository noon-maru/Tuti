const integratedRegionPattern = /전남광주(?:통|통합)특별시/gu;
const integratedRegionNames = new Set([
  "전남광주통특별시",
  "전남광주통합특별시",
]);
const gwangjuDistricts = new Set(["광산구", "남구", "동구", "북구", "서구"]);

export function toPublicPlaceName(
  value: string,
  sidoName?: string | null,
  sigunguName?: string | null,
) {
  return replaceIntegratedRegion(value, sidoName, sigunguName);
}

export function toPublicPlaceAddress(
  value: string | null,
  sidoName?: string | null,
  sigunguName?: string | null,
) {
  return value === null
    ? null
    : replaceIntegratedRegion(value, sidoName, sigunguName);
}

export function toPublicSidoName(
  sidoName?: string | null,
  sigunguName?: string | null,
) {
  if (!sidoName || !integratedRegionNames.has(sidoName)) return sidoName ?? null;
  return gwangjuDistricts.has(sigunguName ?? "") ? "광주광역시" : "전라남도";
}

export function toPublicRegionLabel(
  sidoName?: string | null,
  sigunguName?: string | null,
) {
  return [toPublicSidoName(sidoName, sigunguName), sigunguName]
    .filter(Boolean)
    .join(" ") || null;
}

function replaceIntegratedRegion(
  value: string,
  sidoName?: string | null,
  sigunguName?: string | null,
) {
  const publicRegion = toPublicSidoName(sidoName, sigunguName);
  const shortRegion = publicRegion === "전라남도" ? "전남" : "광주";
  return value
    .replace(integratedRegionPattern, `${shortRegion} `)
    .replace(/\s+/gu, " ")
    .trim();
}
