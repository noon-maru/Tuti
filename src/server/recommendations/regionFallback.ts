import type { PreferredRegion } from "@/shared/tuti/types";

export function getPreferredRegionWhere(preferredRegion: PreferredRegion) {
  const integratedRegionName = "전남광주통합특별시";
  const district = preferredRegion.sigunguName;

  if (preferredRegion.name === "세종특별자치시") {
    return { sourceSidoName: preferredRegion.name };
  }

  if (preferredRegion.name === "광주광역시") {
    return {
      OR: [
        {
          sourceSidoName: preferredRegion.name,
          sourceSigunguName: district,
        },
        {
          sourceSidoName: integratedRegionName,
          sourceSigunguName: district,
        },
      ],
    };
  }

  if (preferredRegion.name === "전라남도") {
    return {
      OR: [
        {
          sourceSidoName: preferredRegion.name,
          sourceSigunguName: district,
        },
        {
          sourceSidoName: integratedRegionName,
          sourceSigunguName: district,
        },
      ],
    };
  }

  return {
    sourceSidoName: preferredRegion.name,
    sourceSigunguName: district,
  };
}
