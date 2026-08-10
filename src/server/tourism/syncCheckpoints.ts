import type { Prisma } from "@/generated/prisma/client";

export function getTourismSyncJobKey(
  source: string,
  parameters: Prisma.JsonValue | null,
) {
  const values = asObject(parameters);
  if (!values) return null;

  if (source === "ktoTourismPhotoGallery") {
    return joinKey(values.startPage);
  }
  if (source === "ktoMunicipalCoreTourism") {
    return joinKey(values.baseYm, values.areaCode, values.sigunguCode);
  }
  if (source === "ktoRelatedTourism") {
    return joinKey(values.baseYm, values.areaCode, values.sigunguCode);
  }
  if (source === "ktoTouristSpotConcentrationRate") {
    return joinKey(values.areaCode, values.sigunguCode);
  }
  if (source === "ktoRegionalVisitorCount") {
    return joinKey(values.aggregationLevel, values.baseYmd);
  }
  if (
    source === "ktoRegionalResourceDemand" ||
    source === "ktoRegionalDemandIntensity"
  ) {
    return joinKey(
      values.metricType,
      values.metricCode,
      values.baseYm,
      values.areaCode,
    );
  }
  if (source === "ktoTourismInfo") {
    return joinKey(
      values.contentTypeId ?? "all",
      values.areaCode ?? "all",
      values.startPage ?? 1,
    );
  }
  if (source === "ktoWellnessTourism") {
    return joinKey(
      values.wellnessThemeCode ?? "all",
      values.startPage ?? 1,
    );
  }

  return null;
}

function asObject(value: Prisma.JsonValue | null) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function joinKey(...values: Array<Prisma.JsonValue | undefined>) {
  const normalized = values.map((value) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  });

  return normalized.some((value) => value === null)
    ? null
    : normalized.join(":");
}
