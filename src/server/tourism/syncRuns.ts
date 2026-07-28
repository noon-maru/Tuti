import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

type SyncRunCounts = {
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export async function startExternalDataSyncRun(input: {
  source: string;
  operation: string;
  parameters?: Prisma.InputJsonValue;
}) {
  return prisma.externalDataSyncRun.create({
    data: {
      id: randomUUID(),
      source: input.source,
      operation: input.operation,
      status: "running",
      parameters: input.parameters,
    },
    select: { id: true },
  });
}

export async function completeExternalDataSyncRun(
  id: string,
  counts: SyncRunCounts,
) {
  return prisma.externalDataSyncRun.update({
    where: { id },
    data: {
      status: counts.failed > 0 ? "partial" : "succeeded",
      receivedCount: counts.received,
      createdCount: counts.created,
      updatedCount: counts.updated,
      skippedCount: counts.skipped,
      failedCount: counts.failed,
      finishedAt: new Date(),
    },
  });
}

export async function failExternalDataSyncRun(
  id: string,
  error: unknown,
  counts?: Partial<SyncRunCounts>,
) {
  return prisma.externalDataSyncRun.update({
    where: { id },
    data: {
      status: "failed",
      receivedCount: counts?.received ?? 0,
      createdCount: counts?.created ?? 0,
      updatedCount: counts?.updated ?? 0,
      skippedCount: counts?.skipped ?? 0,
      failedCount: Math.max(1, counts?.failed ?? 0),
      errorMessage: toSafeErrorMessage(error),
      finishedAt: new Date(),
    },
  });
}

function toSafeErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "알 수 없는 동기화 오류";

  return message.replace(/serviceKey=[^&\s]+/gi, "serviceKey=[REDACTED]").slice(
    0,
    2000,
  );
}
