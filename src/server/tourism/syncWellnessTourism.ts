import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";
import {
  fetchWellnessTourismPlaces,
  type WellnessTourismItem,
} from "@/server/tourism/wellnessTourismApiClient";

export type SyncWellnessTourismInput = {
  contentTypeId?: string;
  areaCode?: string;
  sigunguCode?: string;
  wellnessThemeCode?: string;
  modifiedDate?: string;
  maxPages?: number;
  pageSize?: number;
  startPage?: number;
};

export type SyncWellnessTourismResult = {
  syncRunId: string;
  pages: number;
  totalAvailable: number;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export async function syncWellnessTourism(
  input: SyncWellnessTourismInput = {},
): Promise<SyncWellnessTourismResult> {
  const normalized = normalizeInput(input);
  const run = await startExternalDataSyncRun({
    source: "ktoWellnessTourism",
    operation: "areaBasedList",
    parameters: {
      language: "KOR",
      contentTypeId: normalized.contentTypeId ?? null,
      areaCode: normalized.areaCode ?? null,
      sigunguCode: normalized.sigunguCode ?? null,
      wellnessThemeCode: normalized.wellnessThemeCode ?? null,
      modifiedDate: normalized.modifiedDate ?? null,
      maxPages: normalized.maxPages,
      pageSize: normalized.pageSize,
      startPage: normalized.startPage,
    },
  });
  const result: SyncWellnessTourismResult = {
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
    for (let offset = 0; offset < normalized.maxPages; offset += 1) {
      const pageNo = normalized.startPage + offset;
      const page = await fetchWellnessTourismPlaces({
        pageNo,
        numOfRows: normalized.pageSize,
        contentTypeId: normalized.contentTypeId,
        areaCode: normalized.areaCode,
        sigunguCode: normalized.sigunguCode,
        wellnessThemeCode: normalized.wellnessThemeCode,
        modifiedDate: normalized.modifiedDate,
      });

      result.pages += 1;
      result.totalAvailable = page.totalCount;
      result.received += page.items.length;

      for (const item of page.items) {
        try {
          const status = await saveWellnessSourceRecord(item);

          if (status) {
            result[status] += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.failed += 1;
          console.error("웰니스 관광 원본 저장에 실패했습니다.", error);
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

async function saveWellnessSourceRecord(
  item: WellnessTourismItem,
): Promise<"created" | "updated" | null> {
  const contentId = item.contentId?.trim();
  const langDivCd = item.langDivCd?.trim() || "KOR";
  const title = item.title?.trim();

  if (!contentId || !title) return null;

  const uniqueKey = {
    contentId_langDivCd: { contentId, langDivCd },
  };
  const existing = await prisma.wellnessTourismSourceRecord.findUnique({
    where: uniqueKey,
    select: { id: true },
  });
  const data = {
    contentTypeId: cleanString(item.contentTypeId),
    title,
    wellnessThemeCode: cleanString(item.wellnessThemaCd),
    areaCode: cleanString(item.lDongRegnCd),
    sigunguCode: cleanString(item.lDongSignguCd),
    rawPayload: item as Prisma.InputJsonValue,
    sourceModifiedAt: parseTourismDate(item.mdfcnDt),
    syncedAt: new Date(),
  };

  if (existing) {
    await prisma.wellnessTourismSourceRecord.update({
      where: { id: existing.id },
      data,
    });
    return "updated";
  }

  await prisma.wellnessTourismSourceRecord.create({
    data: {
      id: randomUUID(),
      contentId,
      langDivCd,
      ...data,
    },
  });
  return "created";
}

function normalizeInput(input: SyncWellnessTourismInput) {
  const areaCode = normalizeCode(input.areaCode, 10, "지역");
  const sigunguCode = normalizeCode(input.sigunguCode, 10, "시군구");
  const contentTypeId = normalizeCode(
    input.contentTypeId,
    4,
    "콘텐츠 유형",
  );
  const wellnessThemeCode = input.wellnessThemeCode?.trim();
  const modifiedDate = input.modifiedDate?.trim();

  if (sigunguCode && !areaCode) {
    throw new Error("시군구 코드를 사용할 때는 지역 코드가 필요합니다.");
  }

  if (
    wellnessThemeCode &&
    !/^EX050[1-7]00$/.test(wellnessThemeCode)
  ) {
    throw new Error("웰니스 테마 코드를 확인해주세요.");
  }

  if (modifiedDate && !/^\d{8}$/.test(modifiedDate)) {
    throw new Error("수정일은 YYYYMMDD 형식이어야 합니다.");
  }

  return {
    areaCode,
    sigunguCode,
    contentTypeId,
    wellnessThemeCode: wellnessThemeCode || undefined,
    modifiedDate: modifiedDate || undefined,
    maxPages: clampInteger(input.maxPages, 1, 100, 5),
    pageSize: clampInteger(input.pageSize, 1, 100, 100),
    startPage: clampInteger(input.startPage, 1, 100_000, 1),
  };
}

function normalizeCode(
  value: string | undefined,
  maxLength: number,
  label: string,
) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!new RegExp(`^\\d{1,${maxLength}}$`).test(normalized)) {
    throw new Error(`${label} 코드를 확인해주세요.`);
  }
  return normalized;
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
