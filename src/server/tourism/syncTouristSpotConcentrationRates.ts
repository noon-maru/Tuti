import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  fetchTouristSpotConcentrationRates,
  type TouristSpotConcentrationItem,
} from "@/server/tourism/touristSpotConcentrationApiClient";
import {
  completeExternalDataSyncRun,
  failExternalDataSyncRun,
  startExternalDataSyncRun,
} from "@/server/tourism/syncRuns";

export type SyncTouristSpotConcentrationRatesInput = {
  areaCode: string;
  sigunguCode: string;
  touristSpotName?: string;
  maxPages?: number;
  pageSize?: number;
};

export type SyncTouristSpotConcentrationRatesResult = {
  syncRunId: string;
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

export async function syncTouristSpotConcentrationRates(
  input: SyncTouristSpotConcentrationRatesInput,
): Promise<SyncTouristSpotConcentrationRatesResult> {
  const normalized = normalizeInput(input);
  const run = await startExternalDataSyncRun({
    source: "ktoTouristSpotConcentrationRate",
    operation: "tatsCnctrRatedList",
    parameters: normalized,
  });
  const result: SyncTouristSpotConcentrationRatesResult = {
    syncRunId: run.id,
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
      const page = await fetchTouristSpotConcentrationRates({
        areaCode: normalized.areaCode,
        sigunguCode: normalized.sigunguCode,
        touristSpotName: normalized.touristSpotName,
        pageNo,
        numOfRows: normalized.pageSize,
      });

      result.pages += 1;
      result.totalAvailable = page.totalCount;
      result.received += page.items.length;

      const saved = await saveConcentrationRateBatch(page.items);
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

async function saveConcentrationRateBatch(
  items: TouristSpotConcentrationItem[],
) {
  const counts = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
  const batchSize = 20;

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const statuses = await Promise.all(
      batch.map(async (item) => {
        try {
          return await upsertTouristSpotConcentrationRate(item);
        } catch (error) {
          console.error("관광지 집중률 원본 저장에 실패했습니다.", error);
          return "failed" as const;
        }
      }),
    );

    for (const status of statuses) {
      if (status === "created" || status === "updated") {
        counts[status] += 1;
      } else if (status === "failed") {
        counts.failed += 1;
      } else {
        counts.skipped += 1;
      }
    }
  }

  return counts;
}

export async function upsertTouristSpotConcentrationRate(
  item: TouristSpotConcentrationItem,
): Promise<"created" | "updated" | null> {
  const baseYmd = item.baseYmd?.trim();
  const areaCode = item.areaCd?.trim();
  const areaName = item.areaNm?.trim();
  const sigunguCode = item.signguCd?.trim();
  const sigunguName = item.signguNm?.trim();
  const touristSpotName = item.tAtsNm?.trim();
  const concentrationRate = item.cnctrRate?.trim();

  if (
    !baseYmd ||
    !areaCode ||
    !areaName ||
    !sigunguCode ||
    !sigunguName ||
    !touristSpotName ||
    !concentrationRate ||
    !Number.isFinite(Number(concentrationRate))
  ) {
    return null;
  }

  const uniqueKey = {
    baseYmd_areaCode_sigunguCode_touristSpotName: {
      baseYmd,
      areaCode,
      sigunguCode,
      touristSpotName,
    },
  };
  const existing = await prisma.touristSpotConcentrationRateRecord.findUnique({
    where: uniqueKey,
    select: { id: true },
  });
  const data = {
    areaName,
    sigunguName,
    concentrationRate,
    rawPayload: item as Prisma.InputJsonValue,
    syncedAt: new Date(),
  };

  await prisma.touristSpotConcentrationRateRecord.upsert({
    where: uniqueKey,
    update: data,
    create: {
      id: randomUUID(),
      baseYmd,
      areaCode,
      sigunguCode,
      touristSpotName,
      ...data,
    },
  });

  return existing ? "updated" : "created";
}

function normalizeInput(input: SyncTouristSpotConcentrationRatesInput) {
  const areaCode = input.areaCode.trim();
  const sigunguCode = input.sigunguCode.trim();
  const touristSpotName = input.touristSpotName?.trim();

  if (!/^\d{1,10}$/.test(areaCode)) {
    throw new Error("지역 코드를 확인해주세요.");
  }
  if (!/^\d{1,10}$/.test(sigunguCode)) {
    throw new Error("시군구 코드를 확인해주세요.");
  }
  if (touristSpotName && touristSpotName.length > 120) {
    throw new Error("관광지명은 120자 이하여야 합니다.");
  }

  return {
    areaCode,
    sigunguCode,
    touristSpotName: touristSpotName || undefined,
    maxPages: clampInteger(input.maxPages, 1, 20, 5),
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
