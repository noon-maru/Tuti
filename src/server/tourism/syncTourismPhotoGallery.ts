import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  fetchTourismPhotoGalleryRecords,
  type TourismPhotoGalleryItem,
} from "@/server/tourism/tourismPhotoGalleryApiClient";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";

export type SyncTourismPhotoGalleryInput = {
  modifiedDate?: string;
  startPage?: number;
  maxPages?: number;
  pageSize?: number;
};

export type SyncTourismPhotoGalleryResult = {
  syncRunId: string;
  pages: number;
  totalAvailable: number;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export async function syncTourismPhotoGallery(
  input: SyncTourismPhotoGalleryInput = {},
): Promise<SyncTourismPhotoGalleryResult> {
  const normalized = normalizeInput(input);
  const run = await startExternalDataSyncRun({
    source: "ktoTourismPhotoGallery",
    operation: "gallerySyncDetailList1",
    parameters: normalized,
  });
  const result: SyncTourismPhotoGalleryResult = {
    syncRunId: run.id,
    pages: 0,
    totalAvailable: 0,
    received: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    for (
      let pageNo = normalized.startPage;
      pageNo < normalized.startPage + normalized.maxPages;
      pageNo += 1
    ) {
      const page = await fetchTourismPhotoGalleryRecords({
        modifiedDate: normalized.modifiedDate,
        pageNo,
        numOfRows: normalized.pageSize,
      });

      result.pages += 1;
      result.totalAvailable = page.totalCount;
      result.received += page.items.length;

      const saved = await saveTourismPhotoGalleryRecords(page.items);
      result.created += saved.created;
      result.updated += saved.updated;
      result.skipped += saved.skipped;
      result.failed += saved.failed;

      if (
        page.items.length === 0 ||
        pageNo * normalized.pageSize >= page.totalCount
      ) {
        break;
      }
    }

    await completeExternalDataSyncRun(run.id, result);
    return result;
  } catch (error) {
    await failExternalDataSyncRun(run.id, error, result);
    throw error;
  }
}

async function saveTourismPhotoGalleryRecords(
  items: TourismPhotoGalleryItem[],
) {
  const records = items.flatMap((item) => {
    const contentId = item.galContentId?.trim();
    const title = item.galTitle?.trim();
    const imageUrl = item.galWebImageUrl?.trim();

    if (!contentId || !title || !imageUrl) return [];

    return [
      {
        contentId,
        data: {
          contentTypeId: cleanString(item.galContentTypeId),
          title,
          imageUrl,
          useFlag: cleanString(item.galUseFlag),
          photographyMonth: cleanString(item.galPhotographyMonth),
          photographyLocation: cleanString(item.galPhotographyLocation),
          photographer: cleanString(item.galPhotographer),
          searchKeyword: cleanString(item.galSearchKeyword),
          sourceCreatedAt: parseTourismDate(item.galCreatedtime),
          sourceModifiedAt: parseTourismDate(item.galModifiedtime),
          rawPayload: item as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
      },
    ];
  });
  const skipped = items.length - records.length;

  if (records.length === 0) {
    return { created: 0, updated: 0, skipped, failed: 0 };
  }

  const existing = await prisma.tourismPhotoGallerySourceRecord.findMany({
    where: {
      contentId: { in: records.map((record) => record.contentId) },
    },
    select: { contentId: true, sourceModifiedAt: true },
  });
  const existingById = new Map(
    existing.map((record) => [record.contentId, record.sourceModifiedAt]),
  );
  const newRecords = records.filter(
    (record) => !existingById.has(record.contentId),
  );
  const changedRecords = records.filter((record) => {
    const sourceModifiedAt = existingById.get(record.contentId);
    if (sourceModifiedAt === undefined) return false;
    return (
      sourceModifiedAt?.getTime() !==
      record.data.sourceModifiedAt?.getTime()
    );
  });

  try {
    if (newRecords.length > 0) {
      await prisma.tourismPhotoGallerySourceRecord.createMany({
        data: newRecords.map((record) => ({
          contentId: record.contentId,
          ...record.data,
        })),
        skipDuplicates: true,
      });
    }

    if (changedRecords.length > 0) {
      await prisma.$transaction(
        changedRecords.map((record) =>
          prisma.tourismPhotoGallerySourceRecord.upsert({
            where: { contentId: record.contentId },
            update: record.data,
            create: { contentId: record.contentId, ...record.data },
          }),
        ),
      );
    }
  } catch (error) {
    console.error("관광사진 갤러리 원본 묶음 저장에 실패했습니다.", error);
    return {
      created: 0,
      updated: 0,
      skipped,
      failed: records.length,
    };
  }

  const updated = records.length - newRecords.length;
  return {
    created: newRecords.length,
    updated,
    skipped,
    failed: 0,
  };
}

function normalizeInput(input: SyncTourismPhotoGalleryInput) {
  const modifiedDate = input.modifiedDate?.trim();

  if (modifiedDate && !/^\d{4}(\d{2}(\d{2})?)?$/.test(modifiedDate)) {
    throw new Error("수정일은 YYYY, YYYYMM 또는 YYYYMMDD 형식이어야 합니다.");
  }

  return {
    modifiedDate: modifiedDate || undefined,
    startPage: clampInteger(input.startPage, 1, 100_000, 1),
    maxPages: clampInteger(input.maxPages, 1, 20, 5),
    pageSize: clampInteger(input.pageSize, 1, 100, 100),
  };
}

function cleanString(value: string | undefined) {
  return value?.trim() || null;
}

function parseTourismDate(value: string | undefined) {
  const normalized = value?.replace(/\D/g, "");
  if (!normalized || normalized.length < 8) return null;

  const year = normalized.slice(0, 4);
  const month = normalized.slice(4, 6);
  const day = normalized.slice(6, 8);
  const hour = normalized.slice(8, 10) || "00";
  const minute = normalized.slice(10, 12) || "00";
  const second = normalized.slice(12, 14) || "00";
  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`,
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}
