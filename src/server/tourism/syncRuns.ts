import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { getTourismSyncJobKey } from "@/server/tourism/syncCheckpoints";

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
  const completedAt = new Date();

  return prisma.$transaction(async (transaction) => {
    const run = await transaction.externalDataSyncRun.update({
      where: { id },
      data: {
        status: counts.failed > 0 ? "partial" : "succeeded",
        receivedCount: counts.received,
        createdCount: counts.created,
        updatedCount: counts.updated,
        skippedCount: counts.skipped,
        failedCount: counts.failed,
        finishedAt: completedAt,
      },
    });

    if (counts.failed === 0) {
      const jobKey = getTourismSyncJobKey(run.source, run.parameters);
      if (jobKey) {
        await transaction.externalDataSyncCheckpoint.upsert({
          where: {
            source_jobKey: { source: run.source, jobKey },
          },
          create: {
            source: run.source,
            jobKey,
            operation: run.operation,
            parameters: run.parameters ?? undefined,
            completedAt,
          },
          update: {
            operation: run.operation,
            parameters: run.parameters ?? undefined,
            completedAt,
          },
        });
      }
    }

    return run;
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
