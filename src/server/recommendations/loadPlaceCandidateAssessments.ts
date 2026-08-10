import { prisma } from "@/server/db/prisma";
import {
  assessPlaceCandidate,
  type PlaceCandidateAssessment,
  type PlaceCandidateInput,
} from "@/server/recommendations/placeCandidateSelection";

export type AssessedPlace = {
  place: PlaceCandidateInput;
  assessment: PlaceCandidateAssessment;
  sourceId: string | null;
  editorialSyncedAt: Date | null;
  editorialNeedsSync: boolean;
  candidateOverride: "auto" | "include" | "exclude";
  reviewStatus: "pending" | "approved" | "rejected";
  visibilityOverride: "auto" | "show" | "hide";
};

const EDITORIAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

export async function loadPlaceCandidateAssessments(): Promise<AssessedPlace[]> {
  const [places, wellnessRows, coreRows, sourceRegions] = await Promise.all([
    prisma.place.findMany({
      where: { source: "tourapi" },
      select: {
        id: true,
        name: true,
        image: true,
        fatigue: true,
        movementLevel: true,
        moodTags: true,
        latitude: true,
        longitude: true,
        sourceContentType: true,
        sourceAddress: true,
        sourceSidoName: true,
        sourceSigunguName: true,
        sourceCopyright: true,
        sourceModifiedAt: true,
        sourceId: true,
        candidateOverride: true,
        reviewStatus: true,
        visibilityOverride: true,
        seoulRealtimeAreaLink: { select: { areaCode: true } },
        tourismSourceRecord: {
          select: {
            sidoName: true,
            sigunguName: true,
            detailRecord: {
              select: {
                syncedAt: true,
                editorialSyncedAt: true,
                sourceModifiedAt: true,
                overview: true,
                openingHours: true,
                restDate: true,
                reservation: true,
                usageDuration: true,
                experienceGuide: true,
                imagePayload: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.wellnessTourismSourceRecord.findMany({
      select: { contentId: true },
    }),
    prisma.municipalCoreTourismSourceRecord.findMany({
      distinct: ["touristSpotName"],
      select: { touristSpotName: true },
    }),
    prisma.tourismPlaceSourceRecord.findMany({
      select: {
        contentId: true,
        sidoName: true,
        sigunguName: true,
      },
    }),
  ]);
  const wellnessIds = new Set(wellnessRows.map((row) => row.contentId));
  const coreNames = new Set(
    coreRows.map((row) => normalizeName(row.touristSpotName)),
  );
  const sourceRegionByContentId = new Map(
    sourceRegions.map((row) => [row.contentId, row]),
  );

  return places.map((row) => {
    const detail = row.tourismSourceRecord?.detailRecord;
    const sourceRegion = row.sourceId
      ? sourceRegionByContentId.get(row.sourceId)
      : undefined;
    const place: PlaceCandidateInput = {
      id: row.id,
      name: row.name,
      image: row.image,
      fatigue: row.fatigue,
      movementLevel: row.movementLevel,
      moodTags: row.moodTags,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      contentTypeId: row.sourceContentType,
      address: row.sourceAddress,
      sidoName:
        row.sourceSidoName ??
        row.tourismSourceRecord?.sidoName ??
        sourceRegion?.sidoName ??
        null,
      sigunguName:
        row.sourceSigunguName ??
        row.tourismSourceRecord?.sigunguName ??
        sourceRegion?.sigunguName ??
        null,
      copyright: row.sourceCopyright,
      hasWellnessSource: row.sourceId
        ? wellnessIds.has(row.sourceId)
        : false,
      hasCoreTourismSource: coreNames.has(normalizeName(row.name)),
      hasSeoulRealtimeArea: Boolean(row.seoulRealtimeAreaLink),
      detail: detail
        ? {
            synced: Boolean(detail.syncedAt),
            overview: detail.overview,
            openingHours: detail.openingHours,
            restDate: detail.restDate,
            reservation: detail.reservation,
            usageDuration: detail.usageDuration,
            experienceGuide: detail.experienceGuide,
            imageCount: countImages(detail.imagePayload),
          }
        : null,
    };

    return {
      place,
      assessment: assessPlaceCandidate(place),
      sourceId: row.sourceId,
      editorialSyncedAt: detail?.editorialSyncedAt ?? null,
      editorialNeedsSync: needsEditorialSync(
        detail?.editorialSyncedAt ?? null,
        detail?.sourceModifiedAt ?? null,
        row.sourceModifiedAt,
      ),
      candidateOverride: row.candidateOverride,
      reviewStatus: row.reviewStatus,
      visibilityOverride: row.visibilityOverride,
    };
  });
}

function needsEditorialSync(
  syncedAt: Date | null,
  detailSourceModifiedAt: Date | null,
  placeSourceModifiedAt: Date | null,
) {
  if (!syncedAt) return true;
  if (Date.now() - syncedAt.getTime() >= EDITORIAL_MAX_AGE_MS) return true;
  return Boolean(
    placeSourceModifiedAt &&
      (!detailSourceModifiedAt || detailSourceModifiedAt < placeSourceModifiedAt),
  );
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function countImages(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  for (const key of ["items", "item", "images"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested.length;
  }
  return 0;
}
