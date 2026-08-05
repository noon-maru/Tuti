import { prisma } from "@/server/db/prisma";
import {
  normalizeTourApiPlaceDetail,
  toJsonValue,
} from "@/server/tourism/enrichTourismPlaceDetail";
import { fetchTourApiPlaceEditorial } from "@/server/tourism/tourApiDetailClient";

const EDITORIAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const EDITORIAL_RETRY_DELAY_MS = 6 * 60 * 60 * 1_000;
const MAX_ERROR_LENGTH = 1_000;

export type SyncTourismPlaceEditorialResult =
  | "synced"
  | "fresh"
  | "retry_wait";

export async function syncTourismPlaceEditorial(
  contentId: string,
  { force = false }: { force?: boolean } = {},
): Promise<SyncTourismPlaceEditorialResult> {
  const source = await prisma.tourismPlaceSourceRecord.findUnique({
    where: { contentId },
    include: { detailRecord: true },
  });

  if (!source) {
    throw new Error(`관광지 원천정보를 찾지 못했습니다: ${contentId}`);
  }

  const now = new Date();
  const cached = source.detailRecord;

  if (
    !force &&
    cached?.editorialSyncedAt &&
    now.getTime() - cached.editorialSyncedAt.getTime() < EDITORIAL_MAX_AGE_MS &&
    (!source.sourceModifiedAt ||
      (cached.sourceModifiedAt !== null &&
        cached.sourceModifiedAt >= source.sourceModifiedAt))
  ) {
    return "fresh";
  }

  if (
    !force &&
    cached?.editorialRetryAfter &&
    cached.editorialRetryAfter > now
  ) {
    return "retry_wait";
  }

  try {
    const payload = await fetchTourApiPlaceEditorial({
      contentId: source.contentId,
      contentTypeId: source.contentTypeId,
    });
    const normalized = normalizeTourApiPlaceDetail({
      ...payload,
      info: [],
      images: [],
    }).fields;
    const syncedAt = new Date();
    const editorialFields = {
      overview: normalized.overview,
      homepage: normalized.homepage,
      phone: normalized.phone,
      openingHours: normalized.openingHours,
      restDate: normalized.restDate,
      parking: normalized.parking,
      reservation: normalized.reservation,
      usageDuration: normalized.usageDuration,
      experienceGuide: normalized.experienceGuide,
      ...(normalized.admissionFee
        ? { admissionFee: normalized.admissionFee }
        : {}),
    };

    await prisma.tourismPlaceDetailRecord.upsert({
      where: { contentId: source.contentId },
      create: {
        contentId: source.contentId,
        contentTypeId: source.contentTypeId,
        ...editorialFields,
        commonPayload: toJsonValue(payload.common),
        introPayload: toJsonValue(payload.intro),
        sourceModifiedAt: source.sourceModifiedAt,
        editorialSyncedAt: syncedAt,
        editorialAttemptAt: syncedAt,
      },
      update: {
        contentTypeId: source.contentTypeId,
        ...editorialFields,
        commonPayload: toJsonValue(payload.common),
        introPayload: toJsonValue(payload.intro),
        sourceModifiedAt: source.sourceModifiedAt,
        editorialSyncedAt: syncedAt,
        editorialAttemptAt: syncedAt,
        editorialRetryAfter: null,
        editorialLastError: null,
      },
    });

    return "synced";
  } catch (error) {
    const message = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH);
    const retryAfter = new Date(now.getTime() + EDITORIAL_RETRY_DELAY_MS);

    await prisma.tourismPlaceDetailRecord.upsert({
      where: { contentId: source.contentId },
      create: {
        contentId: source.contentId,
        contentTypeId: source.contentTypeId,
        editorialAttemptAt: now,
        editorialRetryAfter: retryAfter,
        editorialLastError: message,
      },
      update: {
        contentTypeId: source.contentTypeId,
        editorialAttemptAt: now,
        editorialRetryAfter: retryAfter,
        editorialLastError: message,
      },
    });

    throw error;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "알 수 없는 소개정보 수집 오류";
}
