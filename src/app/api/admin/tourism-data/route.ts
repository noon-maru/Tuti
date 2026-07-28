import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLogSafely } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  type RegionalMetricType,
} from "@/server/tourism/regionalTourismApiClient";
import {
  MunicipalCoreTourismApiError,
} from "@/server/tourism/municipalCoreTourismApiClient";
import { syncMunicipalCoreTourism } from "@/server/tourism/syncMunicipalCoreTourism";
import { syncRegionalTourismMetrics } from "@/server/tourism/syncRegionalTourismMetrics";
import { syncRegionalVisitorCounts } from "@/server/tourism/syncRegionalVisitorCounts";
import { syncTourismPhotoGallery } from "@/server/tourism/syncTourismPhotoGallery";
import { syncTouristSpotConcentrationRates } from "@/server/tourism/syncTouristSpotConcentrationRates";
import { syncTourismPlaces } from "@/server/tourism/syncTourismPlaces";
import { syncWellnessTourism } from "@/server/tourism/syncWellnessTourism";
import { TourApiError } from "@/server/tourism/tourApiClient";
import { TouristSpotConcentrationApiError } from "@/server/tourism/touristSpotConcentrationApiClient";
import { RegionalVisitorCountApiError } from "@/server/tourism/regionalVisitorCountApiClient";
import { TourismPhotoGalleryApiError } from "@/server/tourism/tourismPhotoGalleryApiClient";
import { WellnessTourismApiError } from "@/server/tourism/wellnessTourismApiClient";
import type {
  TourismDataResponse,
  TourismDataSyncResponse,
  TourismDataTab,
} from "@/shared/api/tourismAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const url = new URL(request.url);
  const tab = normalizeTab(url.searchParams.get("tab"));
  const query = url.searchParams.get("q")?.trim().slice(0, 120);
  const metricType = normalizeMetricType(
    url.searchParams.get("metricType"),
  );
  const take = normalizeInteger(
    Number(url.searchParams.get("take")),
    1,
    200,
    100,
  );
  const [
    overview,
    places,
    wellness,
    municipalCore,
    concentration,
    visitors,
    photos,
    metrics,
    runs,
  ] =
    await Promise.all([
    getOverview(),
    tab === "places"
      ? prisma.tourismPlaceSourceRecord.findMany({
          where: query
            ? {
                OR: [
                  { contentId: { contains: query } },
                  { title: { contains: query, mode: "insensitive" } },
                  { areaCode: { contains: query } },
                  { sidoName: { contains: query, mode: "insensitive" } },
                  { sigunguCode: { contains: query } },
                  { sigunguName: { contains: query, mode: "insensitive" } },
                ],
              }
            : undefined,
          orderBy: [
            { sidoName: "asc" },
            { sigunguName: "asc" },
            { title: "asc" },
          ],
          take,
        })
      : Promise.resolve([]),
    tab === "wellness"
      ? prisma.wellnessTourismSourceRecord.findMany({
          where: query
            ? {
                OR: [
                  { contentId: { contains: query } },
                  { title: { contains: query, mode: "insensitive" } },
                  { wellnessThemeCode: { contains: query } },
                  { areaCode: { contains: query } },
                  { sigunguCode: { contains: query } },
                ],
              }
            : undefined,
          orderBy: { syncedAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    tab === "municipalCore"
      ? prisma.municipalCoreTourismSourceRecord.findMany({
          where: query
            ? {
                OR: [
                  { touristSpotCode: { contains: query } },
                  {
                    touristSpotName: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  { areaName: { contains: query, mode: "insensitive" } },
                  {
                    sigunguName: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  { baseYm: { contains: query } },
                ],
              }
            : undefined,
          orderBy: [{ baseYm: "desc" }, { rank: "asc" }],
          take,
        })
      : Promise.resolve([]),
    tab === "concentration"
      ? prisma.touristSpotConcentrationRateRecord.findMany({
          where: query
            ? {
                OR: [
                  {
                    touristSpotName: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  { areaName: { contains: query, mode: "insensitive" } },
                  {
                    sigunguName: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  { baseYmd: { contains: query } },
                ],
              }
            : undefined,
          orderBy: [{ baseYmd: "desc" }, { concentrationRate: "desc" }],
          take,
        })
      : Promise.resolve([]),
    tab === "visitors"
      ? prisma.regionalVisitorCountRecord.findMany({
          where: query
            ? {
                OR: [
                  { regionName: { contains: query, mode: "insensitive" } },
                  {
                    visitorTypeName: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  { baseYmd: { contains: query } },
                  { aggregationLevel: { contains: query } },
                ],
              }
            : undefined,
          orderBy: [{ baseYmd: "desc" }, { visitorCount: "desc" }],
          take,
        })
      : Promise.resolve([]),
    tab === "photos"
      ? prisma.tourismPhotoGallerySourceRecord.findMany({
          where: query
            ? {
                OR: [
                  { contentId: { contains: query } },
                  { title: { contains: query, mode: "insensitive" } },
                  {
                    photographyLocation: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  {
                    searchKeyword: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : undefined,
          orderBy: { syncedAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    tab === "metrics"
      ? prisma.tourismRegionMetric.findMany({
          where: {
            ...(metricType ? { metricType } : {}),
            ...(query
              ? {
                  OR: [
                    { metricName: { contains: query, mode: "insensitive" } },
                    { areaName: { contains: query, mode: "insensitive" } },
                    { sigunguName: { contains: query, mode: "insensitive" } },
                    { baseYm: { contains: query } },
                  ],
                }
              : {}),
          },
          orderBy: [{ baseYm: "desc" }, { syncedAt: "desc" }],
          take,
        })
      : Promise.resolve([]),
    tab === "runs"
      ? prisma.externalDataSyncRun.findMany({
          where: query
            ? {
                OR: [
                  { source: { contains: query, mode: "insensitive" } },
                  { operation: { contains: query, mode: "insensitive" } },
                  { status: { contains: query, mode: "insensitive" } },
                ],
              }
            : undefined,
          orderBy: { startedAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    ]);
  const response: TourismDataResponse = {
    overview,
    places: places.map((item) => ({
      ...item,
      sourceModifiedAt: item.sourceModifiedAt?.toISOString() ?? null,
      syncedAt: item.syncedAt.toISOString(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
    wellness: wellness.map((item) => ({
      ...item,
      sourceModifiedAt: item.sourceModifiedAt?.toISOString() ?? null,
      syncedAt: item.syncedAt.toISOString(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
    municipalCore: municipalCore.map((item) => ({
      ...item,
      longitude: item.longitude?.toString() ?? null,
      latitude: item.latitude?.toString() ?? null,
      syncedAt: item.syncedAt.toISOString(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
    concentration: concentration.map((item) => ({
      ...item,
      concentrationRate: item.concentrationRate.toString(),
      syncedAt: item.syncedAt.toISOString(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
    visitors: visitors.map((item) => ({
      ...item,
      visitorCount: item.visitorCount.toString(),
      syncedAt: item.syncedAt.toISOString(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
    photos: photos.map((item) => ({
      ...item,
      sourceModifiedAt: item.sourceModifiedAt?.toISOString() ?? null,
      syncedAt: item.syncedAt.toISOString(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
    metrics: metrics.map((item) => ({
      ...item,
      metricValue: item.metricValue?.toString() ?? null,
      syncedAt: item.syncedAt.toISOString(),
      createdAt: undefined,
      updatedAt: undefined,
    })),
    runs: runs.map((item) => ({
      ...item,
      startedAt: item.startedAt.toISOString(),
      finishedAt: item.finishedAt?.toISOString() ?? null,
    })),
  };

  return withCors(request, Response.json(response));
}

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  try {
    const body = (await request.json()) as {
      kind?: unknown;
      contentTypeId?: unknown;
      metricType?: unknown;
      metricCode?: unknown;
      baseYm?: unknown;
      areaCode?: unknown;
      sigunguCode?: unknown;
      wellnessThemeCode?: unknown;
      touristSpotName?: unknown;
      aggregationLevel?: unknown;
      baseYmd?: unknown;
      modifiedDate?: unknown;
    };
    const kind =
      body.kind === "places"
        ? "places"
        : body.kind === "wellness"
          ? "wellness"
          : body.kind === "municipalCore"
            ? "municipalCore"
            : body.kind === "concentration"
              ? "concentration"
              : body.kind === "visitors"
                ? "visitors"
                : body.kind === "photos"
                  ? "photos"
                  : "metrics";
    const result =
      kind === "places"
        ? await syncTourismPlaces({
            contentTypeId: normalizeContentTypeId(body.contentTypeId),
            areaCode:
              normalizeOptionalString(body.areaCode, 10) || undefined,
            sigunguCode:
              normalizeOptionalString(body.sigunguCode, 10) || undefined,
            maxPages: 3,
            pageSize: 100,
          })
        : kind === "wellness"
          ? await syncWellnessTourism({
              contentTypeId: normalizeContentTypeId(body.contentTypeId),
              areaCode:
                normalizeOptionalString(body.areaCode, 10) || undefined,
              sigunguCode:
                normalizeOptionalString(body.sigunguCode, 10) || undefined,
              wellnessThemeCode:
                normalizeOptionalString(body.wellnessThemeCode, 8) ||
                undefined,
              maxPages: 5,
              pageSize: 100,
            })
          : kind === "municipalCore"
            ? await syncMunicipalCoreTourism({
                baseYm: normalizeRequiredString(body.baseYm, 6),
                areaCode: normalizeRequiredString(body.areaCode, 10),
                sigunguCode: normalizeRequiredString(body.sigunguCode, 10),
                maxPages: 2,
                pageSize: 100,
              })
            : kind === "concentration"
              ? await syncTouristSpotConcentrationRates({
                  areaCode: normalizeRequiredString(body.areaCode, 10),
                  sigunguCode: normalizeRequiredString(body.sigunguCode, 10),
                  touristSpotName:
                    normalizeOptionalString(body.touristSpotName, 120) ||
                    undefined,
                  maxPages: 5,
                  pageSize: 100,
                })
              : kind === "visitors"
                ? await syncRegionalVisitorCounts({
                    aggregationLevel:
                      body.aggregationLevel === "metropolitan"
                        ? "metropolitan"
                        : "municipal",
                    baseYmd: normalizeRequiredString(body.baseYmd, 8),
                    maxPages: 10,
                    pageSize: 100,
                  })
                : kind === "photos"
                  ? await syncTourismPhotoGallery({
                      modifiedDate:
                        normalizeOptionalString(body.modifiedDate, 8) ||
                        undefined,
                      maxPages: 5,
                      pageSize: 100,
                    })
                  : await syncRegionalTourismMetrics({
            metricType:
              normalizeMetricType(body.metricType) ?? "serviceDemand",
            metricCode: normalizeRequiredString(body.metricCode, 10),
            baseYm: normalizeRequiredString(body.baseYm, 6),
            areaCode: normalizeRequiredString(body.areaCode, 10),
            sigunguCode:
              normalizeOptionalString(body.sigunguCode, 10) || undefined,
            maxPages: 5,
            pageSize: 100,
          });
    const response: TourismDataSyncResponse = { result };

    await writeSystemLogSafely({
      category: "tourism-data",
      action: `tourism-data.${kind}.synced`,
      message: `관광 공공데이터 ${result.received}건을 동기화했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "external-data-sync-run",
      targetId: result.syncRunId,
      metadata: {
        kind,
        received: result.received,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      },
    });

    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("관광 공공데이터 동기화 중 오류가 발생했습니다.", error);

    const message =
      error instanceof TourApiError ||
      error instanceof WellnessTourismApiError ||
      error instanceof MunicipalCoreTourismApiError ||
      error instanceof TouristSpotConcentrationApiError ||
      error instanceof RegionalVisitorCountApiError ||
      error instanceof TourismPhotoGalleryApiError ||
      error instanceof Error
        ? error.message
        : "관광 공공데이터를 동기화하지 못했습니다.";
    const status =
      (error instanceof TourApiError &&
        error.code === "tour_api_not_configured") ||
      (error instanceof WellnessTourismApiError &&
        error.code === "wellness_api_not_configured")
      ||
      (error instanceof MunicipalCoreTourismApiError &&
        error.code === "municipal_core_api_not_configured")
      ||
      (error instanceof TouristSpotConcentrationApiError &&
        error.code === "tourist_spot_concentration_api_not_configured")
      ||
      (error instanceof RegionalVisitorCountApiError &&
        error.code === "regional_visitor_count_api_not_configured")
      ||
      (error instanceof TourismPhotoGalleryApiError &&
        error.code === "tourism_photo_gallery_api_not_configured")
        ? 503
        : error instanceof TourApiError ||
            error instanceof WellnessTourismApiError ||
              error instanceof MunicipalCoreTourismApiError ||
                error instanceof TouristSpotConcentrationApiError
                || error instanceof RegionalVisitorCountApiError
                || error instanceof TourismPhotoGalleryApiError
          ? 502
          : 400;

    return withCors(
      request,
      Response.json({ error: message }, { status }),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

async function getOverview() {
  const [
    placeSourceRecords,
    wellnessSourceRecords,
    municipalCoreSourceRecords,
    touristSpotConcentrationRecords,
    regionalVisitorCountRecords,
    tourismPhotoGalleryRecords,
    regionalMetrics,
    syncRuns,
    failedRuns,
    lastRun,
  ] = await Promise.all([
    prisma.tourismPlaceSourceRecord.count(),
    prisma.wellnessTourismSourceRecord.count(),
    prisma.municipalCoreTourismSourceRecord.count(),
    prisma.touristSpotConcentrationRateRecord.count(),
    prisma.regionalVisitorCountRecord.count(),
    prisma.tourismPhotoGallerySourceRecord.count(),
    prisma.tourismRegionMetric.count(),
    prisma.externalDataSyncRun.count(),
    prisma.externalDataSyncRun.count({
      where: { status: { in: ["failed", "partial"] } },
    }),
    prisma.externalDataSyncRun.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  return {
    placeSourceRecords,
    wellnessSourceRecords,
    municipalCoreSourceRecords,
    touristSpotConcentrationRecords,
    regionalVisitorCountRecords,
    tourismPhotoGalleryRecords,
    regionalMetrics,
    syncRuns,
    failedRuns,
    lastSyncedAt: lastRun?.finishedAt?.toISOString() ?? null,
    connections: [
      {
        source: "ktoTourismPhotoGallery",
        label: "관광사진 갤러리",
        configured: Boolean(
          process.env.KTO_TOURISM_PHOTO_GALLERY_SERVICE_KEY,
        ),
      },
      {
        source: "ktoRegionalVisitorCount",
        label: "지역별 방문자 수",
        configured: Boolean(
          process.env.KTO_REGIONAL_VISITOR_COUNT_SERVICE_KEY,
        ),
      },
      {
        source: "ktoTouristSpotConcentrationRate",
        label: "관광지 집중률",
        configured: Boolean(
          process.env.KTO_TOURIST_SPOT_CONCENTRATION_RATE_SERVICE_KEY,
        ),
      },
      {
        source: "ktoMunicipalCoreTourism",
        label: "기초지자체 중심 관광지",
        configured: Boolean(
          process.env.KTO_MUNICIPAL_CORE_TOURISM_SERVICE_KEY,
        ),
      },
      {
        source: "ktoWellnessTourism",
        label: "웰니스 관광정보",
        configured: Boolean(
          process.env.KTO_WELLNESS_TOURISM_SERVICE_KEY,
        ),
      },
      {
        source: "ktoTourismInfo",
        label: "국문 관광정보",
        configured: Boolean(process.env.KTO_TOURISM_INFO_SERVICE_KEY),
      },
      {
        source: "ktoRegionalResourceDemand",
        label: "지역별 관광 자원 수요",
        configured: Boolean(
          process.env.KTO_REGIONAL_RESOURCE_DEMAND_SERVICE_KEY,
        ),
      },
      {
        source: "ktoRegionalDemandIntensity",
        label: "지역별 관광 수요 강도",
        configured: Boolean(
          process.env.KTO_REGIONAL_DEMAND_INTENSITY_SERVICE_KEY,
        ),
      },
    ],
  };
}

function normalizeTab(value: unknown): TourismDataTab {
  return value === "wellness" ||
    value === "municipalCore" ||
    value === "concentration" ||
    value === "visitors" ||
    value === "photos" ||
    value === "metrics" ||
    value === "runs"
    ? value
    : "places";
}

function normalizeMetricType(value: unknown): RegionalMetricType | undefined {
  return value === "serviceDemand" ||
    value === "culturalResourceDemand" ||
    value === "stayIntensity" ||
    value === "consumptionIntensity"
    ? value
    : undefined;
}

function normalizeContentTypeId(value: unknown) {
  return typeof value === "string" && /^\d{1,4}$/.test(value.trim())
    ? value.trim()
    : "12";
}

function normalizeRequiredString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeOptionalString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeInteger(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  return Number.isInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}
