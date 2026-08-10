import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  fetchRelatedTourism,
  type RelatedTourismItem,
} from "@/server/tourism/relatedTourismApiClient";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";

export type SyncRelatedTourismInput = {
  baseYm: string;
  areaCode: string;
  sigunguCode: string;
  maxPages?: number;
  pageSize?: number;
};

export type SyncRelatedTourismResult = {
  syncRunId: string;
  baseYm: string;
  areaCode: string;
  sigunguCode: string;
  pages: number;
  totalAvailable: number;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export async function syncRelatedTourism(
  input: SyncRelatedTourismInput,
): Promise<SyncRelatedTourismResult> {
  const normalized = normalizeInput(input);
  const run = await startExternalDataSyncRun({
    source: "ktoRelatedTourism",
    operation: "areaBasedList1",
    parameters: normalized,
  });
  const result: SyncRelatedTourismResult = {
    syncRunId: run.id,
    baseYm: normalized.baseYm,
    areaCode: normalized.areaCode,
    sigunguCode: normalized.sigunguCode,
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
      const page = await fetchRelatedTourism({
        baseYm: normalized.baseYm,
        areaCode: normalized.areaCode,
        sigunguCode: normalized.sigunguCode,
        pageNo,
        numOfRows: normalized.pageSize,
      });

      result.pages += 1;
      result.totalAvailable = page.totalCount;
      result.received += page.items.length;

      for (const item of page.items) {
        try {
          const status = await upsertRelatedTourismRecord(item);
          if (status) result[status] += 1;
          else result.skipped += 1;
        } catch (error) {
          result.failed += 1;
          console.error("연관 관광지 원본 저장에 실패했습니다.", error);
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

export async function upsertRelatedTourismRecord(
  item: RelatedTourismItem,
): Promise<"created" | "updated" | null> {
  const baseYm = cleanString(item.baseYm);
  const touristSpotCode = cleanString(item.tAtsCd);
  const touristSpotName = cleanString(item.tAtsNm);
  const areaCode = cleanString(item.areaCd);
  const areaName = cleanString(item.areaNm);
  const sigunguCode = cleanString(item.signguCd);
  const sigunguName = cleanString(item.signguNm);
  const relatedTouristSpotCode = cleanString(item.rlteTatsCd);
  const relatedTouristSpotName = cleanString(item.rlteTatsNm);
  const relatedAreaCode = cleanString(item.rlteRegnCd);
  const relatedAreaName = cleanString(item.rlteRegnNm);
  const relatedSigunguCode = cleanString(item.rlteSignguCd);
  const relatedSigunguName = cleanString(item.rlteSignguNm);
  const rank = Number(item.rlteRank);

  if (
    !baseYm ||
    !touristSpotCode ||
    !touristSpotName ||
    !areaCode ||
    !areaName ||
    !sigunguCode ||
    !sigunguName ||
    !relatedTouristSpotCode ||
    !relatedTouristSpotName ||
    !relatedAreaCode ||
    !relatedAreaName ||
    !relatedSigunguCode ||
    !relatedSigunguName ||
    !Number.isInteger(rank)
  ) {
    return null;
  }

  const uniqueKey = {
    baseYm_touristSpotCode_relatedTouristSpotCode: {
      baseYm,
      touristSpotCode,
      relatedTouristSpotCode,
    },
  };
  const existing = await prisma.relatedTourismSourceRecord.findUnique({
    where: uniqueKey,
    select: { id: true },
  });
  const data = {
    touristSpotName,
    areaCode,
    areaName,
    sigunguCode,
    sigunguName,
    relatedTouristSpotName,
    relatedAreaCode,
    relatedAreaName,
    relatedSigunguCode,
    relatedSigunguName,
    relatedCategoryLargeName: cleanString(item.rlteCtgryLclsNm),
    relatedCategoryMediumName: cleanString(item.rlteCtgryMclsNm),
    relatedCategorySmallName: cleanString(item.rlteCtgrySclsNm),
    rank,
    rawPayload: item as Prisma.InputJsonValue,
    syncedAt: new Date(),
  };

  await prisma.relatedTourismSourceRecord.upsert({
    where: uniqueKey,
    update: data,
    create: {
      id: randomUUID(),
      baseYm,
      touristSpotCode,
      relatedTouristSpotCode,
      ...data,
    },
  });

  return existing ? "updated" : "created";
}

function normalizeInput(input: SyncRelatedTourismInput) {
  const baseYm = input.baseYm.trim();
  const areaCode = input.areaCode.trim();
  const sigunguCode = input.sigunguCode.trim();

  if (!/^\d{6}$/.test(baseYm)) {
    throw new Error("기준연월은 YYYYMM 형식이어야 합니다.");
  }
  if (!/^\d{1,10}$/.test(areaCode)) {
    throw new Error("지역 코드를 확인해주세요.");
  }
  if (!/^\d{1,10}$/.test(sigunguCode)) {
    throw new Error("시군구 코드를 확인해주세요.");
  }

  return {
    baseYm,
    areaCode,
    sigunguCode,
    maxPages: clampInteger(input.maxPages, 1, 500, 100),
    pageSize: clampInteger(input.pageSize, 1, 100, 100),
  };
}

function cleanString(value: string | undefined) {
  return value?.trim() || null;
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
