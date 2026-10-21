import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { evidenceReviewDue, parseEvidenceHolds, RETENTION_HOLDS_KEY, retentionCutoffs, retentionPredicates, type EvidenceHold } from "./retentionPolicy";

// 보전 등록/해제와 정리가 같은 잠금을 사용한다. 보전 등록 직후 낡은 예외 목록으로 지우지 않는다.
export async function withRetentionLock<T>(write: boolean, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    if (write) await tx.$queryRaw`SELECT pg_advisory_xact_lock(84621, 1)::text`;
    else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(84621, 1)::text`;
    return operation(tx);
  }, { timeout: 30_000, maxWait: 10_000 });
}

export async function loadEvidenceHolds(tx: Prisma.TransactionClient, now: Date) {
  const setting = await tx.appSetting.findUnique({ where: { key: RETENTION_HOLDS_KEY }, select: { value: true } });
  return parseEvidenceHolds(setting?.value ?? null, now);
}

export async function purgeOperationalRetention(now = new Date(), apply = false) {
  const cutoffs = retentionCutoffs(now);
  const enabled = process.env.PRIVACY_EXTENDED_RETENTION_ENABLED === "true";
  const write = apply && enabled;
  return withRetentionLock(write, async tx => {
    const holds = await loadEvidenceHolds(tx, now);
    const where = retentionPredicates(now, holds);
    const dueEvidenceReviews = holds.filter(hold => evidenceReviewDue(hold, now)).length;
    const [inquiries, unfinishedShares, generalErrors] = write
      ? await Promise.all([
        tx.customerInquiry.deleteMany({ where: where.inquiries }).then(result => result.count),
        tx.journalShareTrace.deleteMany({ where: where.unfinishedShares }).then(result => result.count),
        tx.systemLog.deleteMany({ where: where.generalErrors }).then(result => result.count),
      ])
      : await Promise.all([
        tx.customerInquiry.count({ where: where.inquiries }),
        tx.journalShareTrace.count({ where: where.unfinishedShares }),
        tx.systemLog.count({ where: where.generalErrors }),
      ]);
    return {
      mode: write ? "applied" : apply ? "disabled" : "dry-run", enabled, cutoffs,
      inquiries, unfinishedShares, generalErrors,
      evidenceHolds: holds.length, dueEvidenceReviews,
      // 검토 기한이 지나도 증거는 자동 삭제하지 않는다. 기존 실패 알림에서 건수 없이 고정 문구로 알린다.
      reviewRequired: dueEvidenceReviews > 0,
      scope: "completed-inquiries-unfinished-png-traces-dedicated-diagnostics-only",
    };
  });
}

// 보전은 세 범주의 기한 정리만 유예한다. 계정 삭제·철회 거절이나 전체 기록 보존의 근거가 아니다.
export async function updateEvidenceHold(input: { operation: "register"; hold: Omit<EvidenceHold, "reviewedAt"> } | { operation: "review" | "release"; id: string }, now = new Date(), apply = false) {
  retentionCutoffs(now);
  return withRetentionLock(apply, async tx => {
    let holds = await loadEvidenceHolds(tx, now);
    if (input.operation === "register") {
      if (holds.some(hold => hold.id === input.hold.id)) throw new Error("RETENTION_HOLD_EXISTS");
      const hold = { ...input.hold, reviewedAt: now.toISOString() };
      holds = parseEvidenceHolds(JSON.stringify({ version: 1, holds: [...holds, hold] }), now);
      const target = hold.resource === "inquiry"
        ? await tx.customerInquiry.count({ where: { id: hold.targetId } })
        : hold.resource === "shareTrace"
          ? await tx.journalShareTrace.count({ where: { traceId: hold.targetId } })
          : await tx.systemLog.count({ where: { id: hold.targetId, category: "diagnostic", action: "diagnostic.error", level: "error" } });
      if (target !== 1) throw new Error("RETENTION_TARGET_NOT_FOUND");
    } else {
      const hold = holds.find(item => item.id === input.id);
      if (!hold) throw new Error("RETENTION_HOLD_NOT_FOUND");
      holds = input.operation === "release" ? holds.filter(item => item.id !== input.id)
        : holds.map(item => item.id === input.id ? { ...item, reviewedAt: now.toISOString() } : item);
    }
    if (apply) {
      const value = JSON.stringify({ version: 1, holds });
      await tx.appSetting.upsert({ where: { key: RETENTION_HOLDS_KEY }, create: { key: RETENTION_HOLDS_KEY, value }, update: { value } });
    }
    return { mode: apply ? "applied" : "dry-run", operation: input.operation, evidenceHolds: holds.length,
      dueEvidenceReviews: holds.filter(hold => evidenceReviewDue(hold, now)).length };
  });
}
