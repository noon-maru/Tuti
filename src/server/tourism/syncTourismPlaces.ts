import type { Prisma } from "@/generated/prisma/client";
import { isSettingEnabled } from "@/server/admin/settings";
import { prisma } from "@/server/db/prisma";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";
import {
  fetchAreaBasedTourismPlaces,
  type TourApiPlaceItem,
} from "@/server/tourism/tourApiClient";
import { resolveTourApiRegionLabels } from "@/shared/tourism/tourApiRegions";

const TOUR_API_SOURCE = "tourapi";

export type SyncTourismPlacesInput = {
  contentTypeId?: string;
  areaCode?: string;
  sigunguCode?: string;
  maxPages?: number;
  pageSize?: number;
  startPage?: number;
};

export type SyncTourismPlacesResult = {
  syncRunId: string;
  contentTypeId: string | null;
  pages: number;
  totalAvailable: number;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

type NormalizedTourApiPlace = {
  contentId: string;
  contentTypeId: string | null;
  areaCode: string | null;
  sidoName: string | null;
  sigunguCode: string | null;
  sigunguName: string | null;
  name: string;
  address: string | null;
  image: string;
  copyright: string | null;
  sourceModifiedAt: Date | null;
  latitude: number;
  longitude: number;
  phrase: string;
  note: string;
  fatigue: number;
  movementLevel: "near" | "short" | "half";
  moodTags: string[];
};

export async function syncTourismPlaces(
  input: SyncTourismPlacesInput = {},
): Promise<SyncTourismPlacesResult> {
  const contentTypeId = normalizeContentTypeId(input.contentTypeId);
  const areaCode = normalizeOptionalCode(input.areaCode);
  const sigunguCode = normalizeOptionalCode(input.sigunguCode);
  const maxPages = clampInteger(input.maxPages, 1, 100, 3);
  const pageSize = clampInteger(input.pageSize, 1, 100, 100);
  const startPage = clampInteger(input.startPage, 1, 100_000, 1);
  const autoApprove = await isSettingEnabled(
    "places.publicDataAutoApprove",
  );
  const run = await startExternalDataSyncRun({
    source: "ktoTourismInfo",
    operation: "areaBasedList2",
    parameters: {
      contentTypeId: contentTypeId ?? null,
      areaCode,
      sigunguCode,
      maxPages,
      pageSize,
      startPage,
    },
  });
  const result: SyncTourismPlacesResult = {
    syncRunId: run.id,
    contentTypeId: contentTypeId ?? null,
    pages: 0,
    totalAvailable: 0,
    received: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    for (let offset = 0; offset < maxPages; offset += 1) {
      const pageNo = startPage + offset;
      const page = await fetchAreaBasedTourismPlaces({
        pageNo,
        numOfRows: pageSize,
        contentTypeId,
        areaCode: areaCode ?? undefined,
        sigunguCode: sigunguCode ?? undefined,
      });

      result.pages += 1;
      result.totalAvailable = page.totalCount;
      result.received += page.items.length;

      for (const item of page.items) {
        try {
          const contentId = await saveTourismPlaceSourceRecord(item);
          const place = normalizeTourApiPlace(item);

          if (!place || !contentId) {
            result.skipped += 1;
            continue;
          }

          const saved = await saveTourApiPlace(place, autoApprove);
          await prisma.tourismPlaceSourceRecord.update({
            where: { contentId },
            data: { linkedPlaceId: saved.placeId },
          });
          result[saved.status] += 1;
        } catch (error) {
          result.failed += 1;
          console.error("TourAPI 장소 원본 처리에 실패했습니다.", error);
        }
      }

      const reachedLastPage =
        page.items.length === 0 ||
        pageNo * pageSize >= page.totalCount;

      if (reachedLastPage) break;
    }

    await completeExternalDataSyncRun(run.id, result);
    return result;
  } catch (error) {
    await failExternalDataSyncRun(run.id, error, result);
    throw error;
  }
}

async function saveTourApiPlace(
  place: NormalizedTourApiPlace,
  autoApprove: boolean,
): Promise<{
  status: "created" | "updated";
  placeId: string;
}> {
  const syncedAt = new Date();
  const existing = await prisma.place.findUnique({
    where: {
      source_sourceId: {
        source: TOUR_API_SOURCE,
        sourceId: place.contentId,
      },
    },
    select: {
      id: true,
      reviewStatus: true,
      visibilityOverride: true,
    },
  });

  if (!existing) {
    const id = `${TOUR_API_SOURCE}-${place.contentId}`;

    await prisma.place.create({
      data: {
        id,
        name: place.name,
        phrase: place.phrase,
        note: place.note,
        image: place.image,
        travelTime: "이동 시간 확인 필요",
        crowd: "정보 없음",
        today: "운영 정보 확인 필요",
        fatigue: place.fatigue,
        movementLevel: place.movementLevel,
        moodTags: place.moodTags,
        latitude: place.latitude.toFixed(6),
        longitude: place.longitude.toFixed(6),
        source: TOUR_API_SOURCE,
        sourceId: place.contentId,
        sourceContentType: place.contentTypeId,
        sourceAddress: place.address,
        sourceAreaCode: place.areaCode,
        sourceSidoName: place.sidoName,
        sourceSigunguCode: place.sigunguCode,
        sourceSigunguName: place.sigunguName,
        sourceCopyright: place.copyright,
        sourceModifiedAt: place.sourceModifiedAt,
        sourceSyncedAt: syncedAt,
        reviewStatus: autoApprove ? "approved" : "pending",
        isActive: autoApprove,
      },
    });

    await updatePlaceLocation(id, place.longitude, place.latitude);
    return { status: "created", placeId: id };
  }

  const canRefreshDraft = existing.reviewStatus === "pending";

  await prisma.place.update({
    where: { id: existing.id },
    data: {
      sourceContentType: place.contentTypeId,
      sourceAddress: place.address,
      sourceAreaCode: place.areaCode,
      sourceSidoName: place.sidoName,
      sourceSigunguCode: place.sigunguCode,
      sourceSigunguName: place.sigunguName,
      sourceCopyright: place.copyright,
      sourceModifiedAt: place.sourceModifiedAt,
      sourceSyncedAt: syncedAt,
      ...(canRefreshDraft
        ? {
            name: place.name,
            phrase: place.phrase,
            note: place.note,
            image: place.image,
            fatigue: place.fatigue,
            movementLevel: place.movementLevel,
            moodTags: place.moodTags,
            latitude: place.latitude.toFixed(6),
            longitude: place.longitude.toFixed(6),
            ...(autoApprove
              ? {
                  reviewStatus: "approved" as const,
                  isActive: existing.visibilityOverride !== "hide",
                }
              : {}),
          }
        : {}),
    },
  });

  if (canRefreshDraft) {
    await updatePlaceLocation(
      existing.id,
      place.longitude,
      place.latitude,
    );
  }

  return { status: "updated", placeId: existing.id };
}

async function saveTourismPlaceSourceRecord(item: TourApiPlaceItem) {
  const contentId = item.contentid?.trim();
  const title = sanitizeText(item.title);
  const address =
    sanitizeText([item.addr1, item.addr2].filter(Boolean).join(" ")) || null;
  const region = resolveTourApiRegionLabels(
    item.areacode?.trim() || null,
    address,
    item.lDongRegnCd,
  );

  if (!contentId || !title) return null;

  await prisma.tourismPlaceSourceRecord.upsert({
    where: { contentId },
    create: {
      contentId,
      contentTypeId: item.contenttypeid?.trim() || null,
      title,
      areaCode:
        item.lDongRegnCd?.trim() || item.areacode?.trim() || null,
      sidoName: region.sidoName,
      sigunguCode:
        item.lDongSignguCd?.trim() || item.sigungucode?.trim() || null,
      sigunguName: region.sigunguName,
      rawPayload: item as Prisma.InputJsonValue,
      sourceModifiedAt: parseTourApiDate(item.modifiedtime),
      syncedAt: new Date(),
    },
    update: {
      contentTypeId: item.contenttypeid?.trim() || null,
      title,
      areaCode:
        item.lDongRegnCd?.trim() || item.areacode?.trim() || null,
      sidoName: region.sidoName,
      sigunguCode:
        item.lDongSignguCd?.trim() || item.sigungucode?.trim() || null,
      sigunguName: region.sigunguName,
      rawPayload: item as Prisma.InputJsonValue,
      sourceModifiedAt: parseTourApiDate(item.modifiedtime),
      syncedAt: new Date(),
    },
  });

  return contentId;
}

async function updatePlaceLocation(
  id: string,
  longitude: number,
  latitude: number,
) {
  await prisma.$executeRaw`
    UPDATE "places"
    SET "location" = ST_SetSRID(
      ST_MakePoint(${longitude}, ${latitude}),
      4326
    )
    WHERE "id" = ${id}
  `;
}

function normalizeTourApiPlace(
  item: TourApiPlaceItem,
): NormalizedTourApiPlace | null {
  const contentId = item.contentid?.trim();
  const name = sanitizeText(item.title);
  const longitude = parseCoordinate(item.mapx, -180, 180);
  const latitude = parseCoordinate(item.mapy, -90, 90);
  const image = normalizeImageUrl(item.firstimage || item.firstimage2);

  if (!contentId || !name || longitude === null || latitude === null || !image) {
    return null;
  }

  const contentTypeId = item.contenttypeid?.trim() || null;
  const address = sanitizeText(
    [item.addr1, item.addr2].filter(Boolean).join(" "),
  );
  const region = resolveTourApiRegionLabels(
    item.areacode?.trim() || null,
    address || null,
    item.lDongRegnCd,
  );
  const profile = createEditorialDefaults(name, address, contentTypeId);

  return {
    contentId,
    contentTypeId,
    areaCode:
      item.lDongRegnCd?.trim() || item.areacode?.trim() || null,
    sidoName: region.sidoName,
    sigunguCode:
      item.lDongSignguCd?.trim() || item.sigungucode?.trim() || null,
    sigunguName: region.sigunguName,
    name,
    address: address || null,
    image,
    copyright: item.cpyrhtDivCd?.trim() || null,
    sourceModifiedAt: parseTourApiDate(item.modifiedtime),
    latitude,
    longitude,
    ...profile,
  };
}

function createEditorialDefaults(
  name: string,
  address: string,
  contentTypeId: string | null,
) {
  const searchable = `${name} ${address}`.toLowerCase();
  const moodTags = new Set<string>();

  if (/숲|산|휴양림|수목원|사찰|정원/.test(searchable)) {
    moodTags.add("quiet");
    moodTags.add("walk");
    moodTags.add("solitude");
  }

  if (/공원|바다|해변|호수|강|전망|광장/.test(searchable)) {
    moodTags.add("open");
    moodTags.add("walk");
  }

  if (/길|거리|골목|시장|둘레길|산책/.test(searchable)) {
    moodTags.add("walk");
  }

  if (/박물관|미술관|도서관|문화관|전시/.test(searchable)) {
    moodTags.add("quiet");
  }

  if (moodTags.size === 0) moodTags.add("open");

  const isCourseOrLeisure =
    contentTypeId === "25" || contentTypeId === "28";

  return {
    phrase: getDefaultPhrase(contentTypeId),
    note: address
      ? `${address}에 있는 관광 장소예요. 노출 전 상세 내용을 확인해주세요.`
      : "한국관광공사 TourAPI에서 가져온 장소예요. 노출 전 상세 내용을 확인해주세요.",
    fatigue: isCourseOrLeisure ? 55 : contentTypeId === "14" ? 28 : 38,
    movementLevel: isCourseOrLeisure
      ? ("half" as const)
      : ("short" as const),
    moodTags: [...moodTags],
  };
}

function getDefaultPhrase(contentTypeId: string | null) {
  if (contentTypeId === "14") {
    return "천천히 둘러보며 다른 감각을 만나는 곳";
  }

  if (contentTypeId === "25") {
    return "조금 더 길게 바깥의 흐름을 따라가는 날";
  }

  if (contentTypeId === "28") {
    return "몸을 움직이며 공기를 바꿔보고 싶은 날";
  }

  return "잠깐 다른 공기를 만나기 좋은 곳";
}

function normalizeContentTypeId(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && /^\d{1,4}$/.test(normalized)
    ? normalized
    : "12";
}

function normalizeOptionalCode(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && /^\d{1,10}$/.test(normalized) ? normalized : null;
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value as number));
}

function sanitizeText(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseCoordinate(
  value: string | undefined,
  minimum: number,
  maximum: number,
) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) &&
    coordinate >= minimum &&
    coordinate <= maximum
    ? coordinate
    : null;
}

function normalizeImageUrl(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseTourApiDate(value: string | undefined) {
  if (!value || !/^\d{14}$/.test(value)) return null;

  const date = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
      `T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`,
  );

  return Number.isNaN(date.getTime()) ? null : date;
}
