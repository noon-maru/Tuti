import { prisma } from "@/server/db/prisma";

// 장애 확인에 필요한 최소 전달 이력만 보관한다. 제공자 측 보관기간과는 별개다.
export const PUSH_DELIVERY_RETENTION_DAYS = 30;

export function pushRetentionCutoff(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("유효하지 않은 기준 시각입니다.");
  return new Date(now.getTime() - PUSH_DELIVERY_RETENTION_DAYS * 86_400_000);
}

export async function purgePushRetention(now = new Date(), apply = false) {
  const cutoff = pushRetentionCutoff(now);
  const devices = { OR: [{ enabled: false }, { invalidatedAt: { not: null } }] };
  const deliveries = { createdAt: { lte: cutoff } };
  if (!apply) {
    const [invalidDevices, expiredDeliveries] = await Promise.all([
      prisma.pushDevice.count({ where: devices }),
      prisma.pushDelivery.count({ where: deliveries }),
    ]);
    return { mode: "dry-run", cutoff, invalidDevices, expiredDeliveries };
  }
  return prisma.$transaction(async (tx) => {
    const invalidDevices = await tx.pushDevice.deleteMany({ where: devices });
    const expiredDeliveries = await tx.pushDelivery.deleteMany({ where: deliveries });
    // 과거 오류 메시지·문의 식별값은 새 최소 수집 기준에 맞게 제거한다.
    const minimized = await tx.pushDelivery.updateMany({
      where: { OR: [{ entityId: { not: null } }, { errorMessage: { not: null } }] },
      data: { entityId: null, errorMessage: null },
    });
    return { mode: "applied", cutoff, invalidDevices: invalidDevices.count,
      expiredDeliveries: expiredDeliveries.count, minimized: minimized.count };
  });
}
