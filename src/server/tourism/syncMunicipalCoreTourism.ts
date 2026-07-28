import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  fetchMunicipalCoreTourism,
  type MunicipalCoreTourismItem,
} from "@/server/tourism/municipalCoreTourismApiClient";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";

export type SyncMunicipalCoreTourismInput = {
  baseYm: string;
  areaCode: string;
  sigunguCode: string;
  maxPages?: number;
  pageSize?: number;
};

export type SyncMunicipalCoreTourismResult = {
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

export async function syncMunicipalCoreTourism(
  input: SyncMunicipalCoreTourismInput,
): Promise<SyncMunicipalCoreTourismResult> {
  const normalized = normalizeInput(input);
  const run = await startExternalDataSyncRun({
    source: "ktoMunicipalCoreTourism",
    operation: "areaBasedList1",
    parameters: normalized,
  });
  const result: SyncMunicipalCoreTourismResult = {
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
      const page = await fetchMunicipalCoreTourism({
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
          const status = await saveMunicipalCoreTourismRecord(item);

          if (status) {
            result[status] += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.failed += 1;
          console.error("중심 관광지 원본 저장에 실패했습니다.", error);
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

async function saveMunicipalCoreTourismRecord(
  item: MunicipalCoreTourismItem,
): Promise<"created" | "updated" | null> {
  const baseYm = item.baseYm?.trim();
  const areaCode = item.areaCd?.trim();
  const areaName = item.areaNm?.trim();
  const sigunguCode = item.signguCd?.trim();
  const sigunguName = item.signguNm?.trim();
  const touristSpotCode = item.hubTatsCd?.trim();
  const touristSpotName = item.hubTatsNm?.trim();
  const rank = Number(item.hubRank);

  if (
    !baseYm ||
    !areaCode ||
    !areaName ||
    !sigunguCode ||
    !sigunguName ||
    !touristSpotCode ||
    !touristSpotName ||
    !Number.isInteger(rank)
  ) {
    return null;
  }

  const uniqueKey = {
    baseYm_areaCode_sigunguCode_touristSpotCode: {
      baseYm,
      areaCode,
      sigunguCode,
      touristSpotCode,
    },
  };
  const existing = await prisma.municipalCoreTourismSourceRecord.findUnique({
    where: uniqueKey,
    select: { id: true },
  });
  const data = {
    areaName,
    sigunguName,
    touristSpotName,
    rank,
    categoryLargeName: cleanString(item.hubCtgryLclsNm),
    categoryMediumName: cleanString(item.hubCtgryMclsNm),
    longitude: toDecimal(item.mapX),
    latitude: toDecimal(item.mapY),
    rawPayload: item as Prisma.InputJsonValue,
    syncedAt: new Date(),
  };

  await prisma.municipalCoreTourismSourceRecord.upsert({
    where: uniqueKey,
    update: data,
    create: {
      id: randomUUID(),
      baseYm,
      areaCode,
      sigunguCode,
      touristSpotCode,
      ...data,
    },
  });

  return existing ? "updated" : "created";
}

function normalizeInput(input: SyncMunicipalCoreTourismInput) {
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
    maxPages: clampInteger(input.maxPages, 1, 10, 2),
    pageSize: clampInteger(input.pageSize, 1, 100, 100),
  };
}

function cleanString(value: string | undefined) {
  return value?.trim() || null;
}

function toDecimal(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && Number.isFinite(Number(normalized))
    ? normalized
    : null;
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
