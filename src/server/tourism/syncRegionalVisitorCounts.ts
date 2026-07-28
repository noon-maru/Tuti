import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  fetchRegionalVisitorCounts,
  type RegionalVisitorCountItem,
  type VisitorAggregationLevel,
} from "@/server/tourism/regionalVisitorCountApiClient";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";

export type SyncRegionalVisitorCountsInput = {
  aggregationLevel: VisitorAggregationLevel;
  baseYmd: string;
  maxPages?: number;
  pageSize?: number;
};

export type SyncRegionalVisitorCountsResult = {
  syncRunId: string;
  aggregationLevel: VisitorAggregationLevel;
  baseYmd: string;
  pages: number;
  totalAvailable: number;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export async function syncRegionalVisitorCounts(
  input: SyncRegionalVisitorCountsInput,
): Promise<SyncRegionalVisitorCountsResult> {
  const normalized = normalizeInput(input);
  const run = await startExternalDataSyncRun({
    source: "ktoRegionalVisitorCount",
    operation:
      normalized.aggregationLevel === "metropolitan"
        ? "metcoRegnVisitrDDList"
        : "locgoRegnVisitrDDList",
    parameters: normalized,
  });
  const result: SyncRegionalVisitorCountsResult = {
    syncRunId: run.id,
    aggregationLevel: normalized.aggregationLevel,
    baseYmd: normalized.baseYmd,
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
      const page = await fetchRegionalVisitorCounts({
        aggregationLevel: normalized.aggregationLevel,
        baseYmd: normalized.baseYmd,
        pageNo,
        numOfRows: normalized.pageSize,
      });

      result.pages += 1;
      result.totalAvailable = page.totalCount;
      result.received += page.items.length;

      for (const item of page.items) {
        try {
          const status = await saveRegionalVisitorCount(
            normalized.aggregationLevel,
            item,
          );

          if (status) {
            result[status] += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.failed += 1;
          console.error("지역별 방문자 수 원본 저장에 실패했습니다.", error);
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

async function saveRegionalVisitorCount(
  aggregationLevel: VisitorAggregationLevel,
  item: RegionalVisitorCountItem,
): Promise<"created" | "updated" | null> {
  const baseYmd = item.baseYmd?.trim();
  const regionCode =
    (aggregationLevel === "metropolitan" ? item.areaCode : item.signguCode)?.trim();
  const regionName =
    (aggregationLevel === "metropolitan" ? item.areaNm : item.signguNm)?.trim();
  const weekdayCode = item.daywkDivCd?.trim();
  const weekdayName = item.daywkDivNm?.trim();
  const visitorTypeCode = item.touDivCd?.trim();
  const visitorTypeName = item.touDivNm?.trim();
  const visitorCount = item.touNum?.trim();

  if (
    !baseYmd ||
    !regionCode ||
    !regionName ||
    !weekdayCode ||
    !weekdayName ||
    !visitorTypeCode ||
    !visitorTypeName ||
    !visitorCount ||
    !Number.isFinite(Number(visitorCount))
  ) {
    return null;
  }

  const uniqueKey = {
    aggregationLevel_baseYmd_regionCode_weekdayCode_visitorTypeCode: {
      aggregationLevel,
      baseYmd,
      regionCode,
      weekdayCode,
      visitorTypeCode,
    },
  };
  const existing = await prisma.regionalVisitorCountRecord.findUnique({
    where: uniqueKey,
    select: { id: true },
  });
  const data = {
    regionName,
    weekdayName,
    visitorTypeName,
    visitorCount,
    rawPayload: item as Prisma.InputJsonValue,
    syncedAt: new Date(),
  };

  await prisma.regionalVisitorCountRecord.upsert({
    where: uniqueKey,
    update: data,
    create: {
      id: randomUUID(),
      aggregationLevel,
      baseYmd,
      regionCode,
      weekdayCode,
      visitorTypeCode,
      ...data,
    },
  });

  return existing ? "updated" : "created";
}

function normalizeInput(input: SyncRegionalVisitorCountsInput) {
  const baseYmd = input.baseYmd.trim();

  if (!/^\d{8}$/.test(baseYmd)) {
    throw new Error("기준일은 YYYYMMDD 형식이어야 합니다.");
  }

  return {
    aggregationLevel: input.aggregationLevel,
    baseYmd,
    maxPages: clampInteger(input.maxPages, 1, 20, 10),
    pageSize: clampInteger(input.pageSize, 1, 100, 100),
  };
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
