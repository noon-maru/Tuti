import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { fetchTourApiPlaceDetail } from "@/server/tourism/tourApiDetailClient";
import {
  fetchTourismAccommodations,
  type TourApiPlaceItem,
} from "@/server/tourism/tourApiClient";
import type {
  NearbyAccommodation,
  NearbyAccommodationsResponse,
} from "@/shared/api/accommodations";

const CONTENT_TYPE_ID = "32";
const DETAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const DETAIL_RETRY_MS = 6 * 60 * 60 * 1_000;

export async function syncAccommodationSources({
  pageSize = 100,
  maxPages,
}: {
  pageSize?: number;
  maxPages?: number;
} = {}) {
  const startedAt = new Date();
  const firstPage = await fetchTourismAccommodations({
    pageNo: 1,
    numOfRows: pageSize,
  });
  const totalPages = Math.ceil(firstPage.totalCount / pageSize);
  const pagesToSync = Math.min(totalPages, maxPages ?? totalPages);
  let received = 0;
  let persisted = 0;

  for (let pageNo = 1; pageNo <= pagesToSync; pageNo += 1) {
    const page = pageNo === 1
      ? firstPage
      : await fetchTourismAccommodations({ pageNo, numOfRows: pageSize });
    received += page.items.length;

    for (const item of page.items) {
      const normalized = normalizeSource(item, startedAt);
      if (!normalized) continue;

      await prisma.accommodationSourceRecord.upsert({
        where: { contentId: normalized.contentId },
        create: normalized,
        update: normalized,
      });
      persisted += 1;
    }

    if (pageNo % 10 === 0 || pageNo === pagesToSync) {
      console.log(`숙박 원천 진행 ${pageNo}/${pagesToSync}쪽`);
    }
  }

  if (pagesToSync === totalPages) {
    await prisma.accommodationSourceRecord.updateMany({
      where: { sourceSyncedAt: { lt: startedAt }, isActive: true },
      data: { isActive: false },
    });
  }

  return {
    totalAvailable: firstPage.totalCount,
    totalPages,
    syncedPages: pagesToSync,
    received,
    persisted,
    complete: pagesToSync === totalPages,
  };
}

export async function findNearbyAccommodations(
  placeId: string,
): Promise<NearbyAccommodationsResponse | null> {
  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  if (!place) return null;

  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  const candidates = await prisma.$queryRaw<Array<{
    contentId: string;
    distanceMeters: number;
  }>>`
    SELECT
      "content_id" AS "contentId",
      ST_Distance(
        ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters"
    FROM "accommodation_source_records"
    WHERE "is_active" = true
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        25000
      )
    ORDER BY "distanceMeters" ASC
    LIMIT 8
  `;

  const enriched = await mapWithConcurrency(candidates, 2, async (candidate) => {
    const accommodation = await ensureAccommodationDetail(candidate.contentId);
    return accommodation
      ? toNearbyAccommodation(accommodation, Number(candidate.distanceMeters))
      : null;
  });

  return {
    place: { id: place.id, name: place.name },
    accommodations: enriched
      .filter((value): value is NearbyAccommodation => value !== null)
      .slice(0, 3),
  };
}

async function ensureAccommodationDetail(contentId: string) {
  const record = await prisma.accommodationSourceRecord.findUnique({
    where: { contentId },
  });
  if (!record) return null;

  const now = new Date();
  if (
    record.detailSyncedAt &&
    now.getTime() - record.detailSyncedAt.getTime() < DETAIL_MAX_AGE_MS
  ) {
    return record;
  }
  if (record.detailRetryAfter && record.detailRetryAfter > now) return record;

  try {
    const detail = await fetchTourApiPlaceDetail({
      contentId,
      contentTypeId: CONTENT_TYPE_ID,
    });
    const common = detail.common ?? {};
    const intro = detail.intro ?? {};
    const saved = await prisma.accommodationSourceRecord.update({
      where: { contentId },
      data: {
        checkInTime: readText(intro.checkintime),
        checkOutTime: readText(intro.checkouttime),
        roomCount: readText(intro.roomcount),
        roomType: readText(intro.roomtype),
        reservation: readText(intro.reservationlodging),
        reservationUrl: readUrl(intro.reservationurl),
        parking: readText(intro.parkinglodging),
        pickup: readText(intro.pickup),
        foodPlace: readText(intro.foodplace),
        subFacility: readText(intro.subfacility),
        homepage: readUrl(common.homepage),
        overview: readText(common.overview),
        introPayload: toJson(detail.intro),
        infoPayload: toJson(detail.info),
        imagePayload: toJson(detail.images),
        detailSyncedAt: now,
        detailRetryAfter: null,
        detailLastError: null,
      },
    });
    return saved;
  } catch (error) {
    await prisma.accommodationSourceRecord.update({
      where: { contentId },
      data: {
        detailRetryAfter: new Date(now.getTime() + DETAIL_RETRY_MS),
        detailLastError: getErrorMessage(error).slice(0, 1_000),
      },
    });
    return record;
  }
}

function normalizeSource(item: TourApiPlaceItem, syncedAt: Date) {
  const contentId = item.contentid?.trim();
  const name = item.title?.trim();
  const latitude = Number(item.mapy);
  const longitude = Number(item.mapx);
  if (
    !contentId ||
    !name ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    contentId,
    contentTypeId: item.contenttypeid?.trim() || CONTENT_TYPE_ID,
    name,
    address: [item.addr1, item.addr2].filter(Boolean).join(" ").trim() || null,
    areaCode: item.areacode?.trim() || null,
    sigunguCode: item.sigungucode?.trim() || null,
    latitude,
    longitude,
    image: item.firstimage?.trim() || null,
    thumbnail: item.firstimage2?.trim() || null,
    phone: item.tel?.trim() || null,
    categoryCode: item.cat3?.trim() || null,
    rawPayload: item as Prisma.InputJsonValue,
    sourceModifiedAt: parseTourApiDate(item.modifiedtime),
    sourceSyncedAt: syncedAt,
    isActive: true,
  };
}

function toNearbyAccommodation(
  record: NonNullable<Awaited<ReturnType<typeof ensureAccommodationDetail>>>,
  distanceMeters: number,
): NearbyAccommodation {
  return {
    id: record.contentId,
    name: record.name,
    address: record.address,
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    image: record.image ?? record.thumbnail,
    distanceMeters,
    checkInTime: record.checkInTime,
    checkOutTime: record.checkOutTime,
    reservation: record.reservation,
    bookingUrl: record.reservationUrl ?? record.homepage,
    parking: record.parking,
    overview: record.overview,
  };
}

function parseTourApiDate(value: string | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10) || "00"}:${digits.slice(10, 12) || "00"}:${digits.slice(12, 14) || "00"}+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function readUrl(value: unknown) {
  const text = readText(value);
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : value as Prisma.InputJsonValue;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function mapWithConcurrency<Input, Output>(
  values: Input[],
  concurrency: number,
  mapper: (value: Input) => Promise<Output>,
) {
  const result = new Array<Output>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}
