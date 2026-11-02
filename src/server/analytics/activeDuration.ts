import type { Prisma } from "@/generated/prisma/client";
import { recordLifecycle } from "./lifecycle";
import type { LifecycleInput } from "@/shared/api/lifecycle";

export async function recordActiveDuration(tx: Prisma.TransactionClient, userId: string, input: LifecycleInput, end: Date) {
  if (!input.activeMilliseconds || !input.sessionId) throw new Error("ACTIVE_INTERVAL_REQUIRED");
  // 기기·탭이 겹쳐도 사용자별 관측 시간을 중복 합산하지 않는다. 반환 void는 text로 캐스팅한다.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tuti-active-duration'), hashtext(${userId}))::text`;
  const previous = await tx.lifecycleEvent.findFirst({ where: { userId, name: "session_active" },
    orderBy: { occurredAt: "desc" }, select: { occurredAt: true } });
  const start = Math.max(end.getTime() - input.activeMilliseconds, previous?.occurredAt.getTime() ?? -Infinity);
  const milliseconds = end.getTime() - start;
  // 재시도·겹침·늦게 도착한 과거 구간은 성공 응답하되 시간을 추가하지 않는다.
  if (milliseconds <= 0) return;
  await recordLifecycle(tx, userId, { name: "session_active", key: `client:${userId}:${input.id}`, activeMilliseconds: milliseconds }, input, end);
}
