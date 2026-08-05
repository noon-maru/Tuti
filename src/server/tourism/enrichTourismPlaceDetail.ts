import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  fetchTourApiPlaceDetail,
  type TourApiDetailItem,
  type TourApiPlaceDetailPayload,
} from "@/server/tourism/tourApiDetailClient";
import type {
  TourismPlaceDetail,
  TourismPlaceDetailImage,
  TourismPlaceDetailSection,
} from "@/shared/api/placeDetails";

const DETAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const DETAIL_RETRY_DELAY_MS = 6 * 60 * 60 * 1_000;
const MAX_ERROR_LENGTH = 1_000;

const detailRequests = new Map<
  string,
  Promise<TourismPlaceDetail | null>
>();

export async function ensureTourismPlaceDetail(
  placeId: string,
  options: { force?: boolean } = {},
): Promise<TourismPlaceDetail | null> {
  const existingRequest = detailRequests.get(placeId);
  if (existingRequest) return existingRequest;

  const request = ensureTourismPlaceDetailOnce(placeId, options).finally(
    () => {
      detailRequests.delete(placeId);
    },
  );
  detailRequests.set(placeId, request);
  return request;
}

async function ensureTourismPlaceDetailOnce(
  placeId: string,
  { force = false }: { force?: boolean },
): Promise<TourismPlaceDetail | null> {
  const source = await prisma.tourismPlaceSourceRecord.findFirst({
    where: { linkedPlaceId: placeId },
    include: { detailRecord: true },
  });

  if (!source) return null;

  const now = new Date();
  const cached = source.detailRecord;

  if (!force && cached && isFresh(cached, source.sourceModifiedAt, now)) {
    return detailRecordToResult(cached, false);
  }

  if (!force && cached?.retryAfter && cached.retryAfter > now) {
    return cached.syncedAt ? detailRecordToResult(cached, true) : null;
  }

  try {
    const payload = await fetchTourApiPlaceDetail({
      contentId: source.contentId,
      contentTypeId: source.contentTypeId,
    });
    const normalized = normalizeTourApiPlaceDetail(payload);
    const syncedAt = new Date();
    const saved = await prisma.tourismPlaceDetailRecord.upsert({
      where: { contentId: source.contentId },
      create: {
        contentId: source.contentId,
        contentTypeId: source.contentTypeId,
        ...normalized.fields,
        commonPayload: toJsonValue(payload.common),
        introPayload: toJsonValue(payload.intro),
        infoPayload: toJsonValue(payload.info),
        imagePayload: toJsonValue(payload.images),
        sourceModifiedAt: source.sourceModifiedAt,
        editorialSyncedAt: syncedAt,
        editorialAttemptAt: syncedAt,
        syncedAt,
        lastAttemptAt: syncedAt,
      },
      update: {
        contentTypeId: source.contentTypeId,
        ...normalized.fields,
        commonPayload: toJsonValue(payload.common),
        introPayload: toJsonValue(payload.intro),
        infoPayload: toJsonValue(payload.info),
        imagePayload: toJsonValue(payload.images),
        sourceModifiedAt: source.sourceModifiedAt,
        editorialSyncedAt: syncedAt,
        editorialAttemptAt: syncedAt,
        editorialRetryAfter: null,
        editorialLastError: null,
        syncedAt,
        lastAttemptAt: syncedAt,
        retryAfter: null,
        lastError: null,
      },
    });

    return detailRecordToResult(saved, false);
  } catch (error) {
    const message = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH);
    const retryAfter = new Date(now.getTime() + DETAIL_RETRY_DELAY_MS);

    await prisma.tourismPlaceDetailRecord.upsert({
      where: { contentId: source.contentId },
      create: {
        contentId: source.contentId,
        contentTypeId: source.contentTypeId,
        lastAttemptAt: now,
        retryAfter,
        lastError: message,
      },
      update: {
        contentTypeId: source.contentTypeId,
        lastAttemptAt: now,
        retryAfter,
        lastError: message,
      },
    });

    if (cached?.syncedAt) return detailRecordToResult(cached, true);
    throw error;
  }
}

function isFresh(
  detail: {
    syncedAt: Date | null;
    sourceModifiedAt: Date | null;
    lastError: string | null;
  },
  currentSourceModifiedAt: Date | null,
  now: Date,
) {
  if (!detail.syncedAt || detail.lastError) return false;
  if (now.getTime() - detail.syncedAt.getTime() >= DETAIL_MAX_AGE_MS) {
    return false;
  }

  return (
    !currentSourceModifiedAt ||
    (detail.sourceModifiedAt !== null &&
      detail.sourceModifiedAt >= currentSourceModifiedAt)
  );
}

export function normalizeTourApiPlaceDetail(payload: TourApiPlaceDetailPayload) {
  const common = payload.common ?? {};
  const intro = payload.intro ?? {};

  return {
    fields: {
      overview: readText(common, "overview"),
      homepage: readHomepage(common.homepage),
      phone: firstText(common, intro, [
        "tel",
        "infocenter",
        "infocenterculture",
        "infocentertourcourse",
        "infocenterleports",
      ]),
      openingHours: firstText(intro, common, [
        "usetime",
        "usetimeculture",
        "usetimeleports",
        "opentimefood",
        "checkintime",
      ]),
      restDate: firstText(intro, common, [
        "restdate",
        "restdateculture",
        "restdateleports",
        "restdatefood",
      ]),
      admissionFee:
        firstText(intro, common, ["usefee", "usefeeleports"]) ??
        findInfoText(payload.info, /입\s*장\s*료|이용\s*요금|관람\s*료/),
      parking: firstText(intro, common, [
        "parking",
        "parkingculture",
        "parkingleports",
        "parkingfood",
      ]),
      reservation: firstText(intro, common, [
        "reservation",
        "reservationurl",
        "reservationlodging",
      ]),
      usageDuration: firstText(intro, common, [
        "spendtime",
        "taketime",
        "usetimefestival",
      ]),
      experienceGuide: firstText(intro, common, [
        "expguide",
        "program",
        "schedule",
      ]),
    },
  };
}

function findInfoText(items: TourApiDetailItem[], titlePattern: RegExp) {
  for (const item of items) {
    const title = readText(item, "infoname");
    if (!title || !titlePattern.test(title)) continue;

    const content = readText(item, "infotext");
    if (content) return content;
  }
  return null;
}

function detailRecordToResult(
  record: {
    contentId: string;
    contentTypeId: string | null;
    overview: string | null;
    homepage: string | null;
    phone: string | null;
    openingHours: string | null;
    restDate: string | null;
    admissionFee: string | null;
    parking: string | null;
    reservation: string | null;
    usageDuration: string | null;
    experienceGuide: string | null;
    infoPayload: Prisma.JsonValue | null;
    imagePayload: Prisma.JsonValue | null;
    syncedAt: Date | null;
  },
  isStale: boolean,
): TourismPlaceDetail {
  if (!record.syncedAt) {
    throw new Error("동기화되지 않은 관광지 상세정보를 변환할 수 없습니다.");
  }

  return {
    contentId: record.contentId,
    contentTypeId: record.contentTypeId,
    overview: record.overview,
    homepage: record.homepage,
    phone: record.phone,
    openingHours: record.openingHours,
    restDate: record.restDate,
    admissionFee: record.admissionFee,
    parking: record.parking,
    reservation: record.reservation,
    usageDuration: record.usageDuration,
    experienceGuide: record.experienceGuide,
    sections: normalizeSections(record.infoPayload),
    images: normalizeImages(record.imagePayload),
    syncedAt: record.syncedAt.toISOString(),
    isStale,
  };
}

function normalizeSections(
  value: Prisma.JsonValue | null,
): TourismPlaceDetailSection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const title = firstText(item, {}, ["infoname", "subname"]);
    const content = firstText(item, {}, [
      "infotext",
      "subdetailoverview",
      "subdetailalt",
    ]);
    return title && content ? [{ title, content }] : [];
  });
}

function normalizeImages(
  value: Prisma.JsonValue | null,
): TourismPlaceDetailImage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const url = readUrl(item.originimgurl);
    if (!url) return [];

    return [
      {
        url,
        thumbnailUrl: readUrl(item.smallimageurl),
        title: readText(item, "imgname"),
        copyrightCode: readText(item, "cpyrhtDivCd"),
        serialNumber: readText(item, "serialnum"),
      },
    ];
  });
}

function firstText(
  primary: TourApiDetailItem,
  secondary: TourApiDetailItem,
  keys: string[],
) {
  for (const key of keys) {
    const value = readText(primary, key) ?? readText(secondary, key);
    if (value) return value;
  }
  return null;
}

function readText(record: TourApiDetailItem, key: string) {
  const value = record[key];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = decodeHtml(String(value))
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text || null;
}

function readHomepage(value: unknown) {
  if (typeof value !== "string") return null;
  const href = value.match(/href=["']([^"']+)["']/i)?.[1] ?? value;
  return readUrl(decodeHtml(href));
}

function readUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();

  try {
    const url = new URL(normalized);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function toJsonValue(value: unknown) {
  return value === null ? undefined : (value as Prisma.InputJsonValue);
}

function isRecord(value: unknown): value is TourApiDetailItem {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 상세정보 수집 오류";
}
