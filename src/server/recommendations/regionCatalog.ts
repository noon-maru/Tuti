import { prisma } from "@/server/db/prisma";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import type {
  RecommendationRegionOption,
  RecommendationRegionsResponse,
} from "@/shared/api/recommendationRegions";
import { getRecommendationRegionIdentity } from "@/shared/tourism/recommendationRegionLabels";
import { tourApiSidoOptions } from "@/shared/tourism/tourApiRegions";

const CATALOG_TTL_MS = 10 * 60_000;

let regionCatalogCache:
  | { expiresAt: number; value: RecommendationRegionsResponse }
  | undefined;

export async function getRecommendationRegionCatalog() {
  if (regionCatalogCache && regionCatalogCache.expiresAt > Date.now()) {
    return regionCatalogCache.value;
  }

  const groups = await prisma.place.groupBy({
    by: ["sourceSidoName", "sourceSigunguName", "sourceSigunguCode"],
    where: recommendablePlaceWhere,
    _count: { _all: true },
  });
  const regions = new Map<string, RecommendationRegionOption>();

  for (const group of groups) {
    if (!group.sourceSidoName) continue;
    const identity = getRecommendationRegionIdentity(
      group.sourceSidoName,
      group.sourceSigunguName,
    );
    if (!identity) continue;
    const districtName = normalizeDistrictName(
      identity.name,
      group.sourceSigunguName,
    );
    if (!districtName) continue;

    const region = regions.get(identity.areaCode) ?? {
      ...identity,
      districts: [],
    };
    const existingDistrict = region.districts.find(
      (district) => district.name === districtName,
    );
    if (existingDistrict) {
      existingDistrict.candidateCount += group._count._all;
      existingDistrict.code ??= group.sourceSigunguCode ?? undefined;
    } else {
      region.districts.push({
        code: group.sourceSigunguCode ?? undefined,
        name: districtName,
        candidateCount: group._count._all,
      });
    }
    regions.set(identity.areaCode, region);
  }

  const areaOrder = new Map(
    tourApiSidoOptions.map(([areaCode], index) => [areaCode, index]),
  );
  const value = {
    regions: [...regions.values()]
      .map((region) => ({
        ...region,
        districts: region.districts.sort((left, right) =>
          left.name.localeCompare(right.name, "ko"),
        ),
      }))
      .sort(
        (left, right) =>
          (areaOrder.get(left.areaCode) ?? Number.MAX_SAFE_INTEGER) -
          (areaOrder.get(right.areaCode) ?? Number.MAX_SAFE_INTEGER),
      ),
  } satisfies RecommendationRegionsResponse;

  regionCatalogCache = {
    expiresAt: Date.now() + CATALOG_TTL_MS,
    value,
  };
  return value;
}

function normalizeDistrictName(
  sidoName: string,
  sigunguName: string | null,
) {
  if (sidoName === "세종특별자치시") return "세종특별자치시";
  const normalized = sigunguName?.trim().match(/^(.+(?:시|군|구))$/u)?.[1];
  if (normalized) return normalized;
  return null;
}
