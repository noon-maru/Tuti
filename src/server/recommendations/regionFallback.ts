import type { PreferredRegion } from "@/shared/tuti/types";

const integratedGwangjuDistricts = [
  "광산구",
  "남구",
  "동구",
  "북구",
  "서구",
];

export function getPreferredRegionWhere(preferredRegion: PreferredRegion) {
  const integratedRegionName = "전남광주통합특별시";

  if (preferredRegion.name === "광주광역시") {
    return {
      OR: [
        { sourceSidoName: preferredRegion.name },
        {
          sourceSidoName: integratedRegionName,
          sourceSigunguName: { in: integratedGwangjuDistricts },
        },
      ],
    };
  }

  if (preferredRegion.name === "전라남도") {
    return {
      OR: [
        { sourceSidoName: preferredRegion.name },
        {
          sourceSidoName: integratedRegionName,
          NOT: {
            sourceSigunguName: { in: integratedGwangjuDistricts },
          },
        },
      ],
    };
  }

  return { sourceSidoName: preferredRegion.name };
}
