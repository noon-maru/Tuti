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
    for (let pageNo = 1; pageNo <= normalized.maxPages; pageNo += 1) {
      const page = await fetchTourismPhotoGalleryRecords({
        modifiedDate: normalized.modifiedDate,
        pageNo,
        numOfRows: normalized.pageSize,
      });

      result.pages += 1;
      result.totalAvailable = page.totalCount;
      result.received += page.items.length;

      for (const item of page.items) {
        try {
          const status = await saveTourismPhotoGalleryRecord(item);

          if (status) {
            result[status] += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.failed += 1;
          console.error("관광사진 갤러리 원본 저장에 실패했습니다.", error);
        }
      }

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

async function saveTourismPhotoGalleryRecord(
  item: TourismPhotoGalleryItem,
): Promise<"created" | "updated" | null> {
  const contentId = item.galContentId?.trim();
  const title = item.galTitle?.trim();
  const imageUrl = item.galWebImageUrl?.trim();

  if (!contentId || !title || !imageUrl) return null;

  const existing = await prisma.tourismPhotoGallerySourceRecord.findUnique({
    where: { contentId },
    select: { contentId: true },
  });
  const data = {
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
  };

  if (existing) {
    await prisma.tourismPhotoGallerySourceRecord.update({
      where: { contentId },
      data,
    });
    return "updated";
  }

  await prisma.tourismPhotoGallerySourceRecord.create({
    data: { contentId, ...data },
  });
  return "created";
}

function normalizeInput(input: SyncTourismPhotoGalleryInput) {
  const modifiedDate = input.modifiedDate?.trim();

  if (modifiedDate && !/^\d{4}(\d{2}(\d{2})?)?$/.test(modifiedDate)) {
    throw new Error("수정일은 YYYY, YYYYMM 또는 YYYYMMDD 형식이어야 합니다.");
  }

  return {
    modifiedDate: modifiedDate || undefined,
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
