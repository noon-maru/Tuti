import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  fetchRegionalTourismMetrics,
  getRegionalMetricFields,
  type RegionalMetricItem,
  type RegionalMetricType,
} from "@/server/tourism/regionalTourismApiClient";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";

export type SyncRegionalTourismMetricsInput = {
  metricType: RegionalMetricType;
  metricCode: string;
  baseYm: string;
  areaCode: string;
  sigunguCode?: string;
  maxPages?: number;
  pageSize?: number;
};

export type SyncRegionalTourismMetricsResult = {
  syncRunId: string;
  metricType: RegionalMetricType;
  metricCode: string;
  baseYm: string;
  areaCode: string;
  pages: number;
  totalAvailable: number;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export async function syncRegionalTourismMetrics(
  input: SyncRegionalTourismMetricsInput,
): Promise<SyncRegionalTourismMetricsResult> {
  const normalized = normalizeInput(input);
  const dataset = getDataset(normalized.metricType);
  const run = await startExternalDataSyncRun({
    source: dataset,
    operation: normalized.metricType,
    parameters: {
      metricType: normalized.metricType,
      metricCode: normalized.metricCode,
      baseYm: normalized.baseYm,
      areaCode: normalized.areaCode,
      sigunguCode: normalized.sigunguCode ?? null,
      maxPages: normalized.maxPages,
      pageSize: normalized.pageSize,
    },
  });
  const result: SyncRegionalTourismMetricsResult = {
    syncRunId: run.id,
    metricType: normalized.metricType,
    metricCode: normalized.metricCode,
    baseYm: normalized.baseYm,
    areaCode: normalized.areaCode,
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
      const page = await fetchRegionalTourismMetrics({
        metricType: normalized.metricType,
        metricCode: normalized.metricCode,
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
          const status = await saveRegionalMetric(
            dataset,
            normalized.metricType,
            item,
          );

          if (status) {
            result[status] += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.failed += 1;
          console.error("지역 관광 지표 저장에 실패했습니다.", error);
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

async function saveRegionalMetric(
  dataset: string,
  metricType: RegionalMetricType,
  item: RegionalMetricItem,
): Promise<"created" | "updated" | null> {
  const fields = getRegionalMetricFields(metricType, item);
  const baseYm = item.baseYm?.trim();
  const areaCode = item.areaCd?.trim();
  const areaName = item.areaNm?.trim();
  const sigunguCode = item.signguCd?.trim();
  const sigunguName = item.signguNm?.trim();
  const metricCode = fields.code?.trim();
  const metricName = fields.name?.trim();

  if (
    !baseYm ||
    !areaCode ||
    !areaName ||
    !sigunguCode ||
    !sigunguName ||
    !metricCode ||
    !metricName
  ) {
    return null;
  }

  const uniqueKey = {
    metricType_metricCode_baseYm_areaCode_sigunguCode: {
      metricType,
      metricCode,
      baseYm,
      areaCode,
      sigunguCode,
    },
  };
  const existing = await prisma.tourismRegionMetric.findUnique({
    where: uniqueKey,
    select: { id: true },
  });
  const syncedAt = new Date();
  const data = {
    dataset,
    metricName,
    metricValue: toDecimalValue(fields.value),
    areaName,
    sigunguName,
    rawPayload: item as Prisma.InputJsonValue,
    syncedAt,
  };

  await prisma.tourismRegionMetric.upsert({
    where: uniqueKey,
    update: data,
    create: {
      id: randomUUID(),
      metricType,
      metricCode,
      baseYm,
      areaCode,
      sigunguCode,
      ...data,
    },
  });

  return existing ? "updated" : "created";
}

function normalizeInput(input: SyncRegionalTourismMetricsInput) {
  if (!/^\d{6}$/.test(input.baseYm)) {
    throw new Error("기준연월은 YYYYMM 형식이어야 합니다.");
  }

  if (!/^\d{1,10}$/.test(input.areaCode)) {
    throw new Error("지역 코드를 확인해주세요.");
  }

  if (!/^\d{2,4}$/.test(input.metricCode)) {
    throw new Error("지표 코드를 확인해주세요.");
  }

  const sigunguCode = input.sigunguCode?.trim();

  if (sigunguCode && !/^\d{1,10}$/.test(sigunguCode)) {
    throw new Error("시군구 코드를 확인해주세요.");
  }

  return {
    metricType: input.metricType,
    metricCode: input.metricCode,
    baseYm: input.baseYm,
    areaCode: input.areaCode,
    sigunguCode: sigunguCode || undefined,
    maxPages: clampInteger(input.maxPages, 1, 20, 5),
    pageSize: clampInteger(input.pageSize, 1, 100, 100),
  };
}

function getDataset(metricType: RegionalMetricType) {
  return metricType === "serviceDemand" ||
    metricType === "culturalResourceDemand"
    ? "ktoRegionalResourceDemand"
    : "ktoRegionalDemandIntensity";
}

function toDecimalValue(value: string | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? value : null;
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
