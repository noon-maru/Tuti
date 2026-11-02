import { Prisma } from "@/generated/prisma/client";
import type { analyticsPeriod } from "./analyticsScope";

/** 세션 수나 방문 추정치가 아닌, 신·구 활동 로그에 나타난 분석 대상 계정의 합집합. */
export function activityAccountCountSql(period: ReturnType<typeof analyticsPeriod>) {
  return Prisma.sql`
    WITH activity AS (
      SELECT user_id FROM product_activity_events
      WHERE created_at >= ${period.start} AND created_at < ${period.end}
        AND retention_until > ${period.end}
      UNION
      SELECT user_id FROM lifecycle_events
      WHERE occurred_at >= ${period.start} AND occurred_at < ${period.end}
        AND retention_until > ${period.end}
    )
    SELECT count(1)::integer AS count
    FROM activity a JOIN users u ON u.id = a.user_id
    WHERE u.role = 'user' AND u.analytics_excluded_at IS NULL
  `;
}

export async function readActivityAccountCount(period: ReturnType<typeof analyticsPeriod>) {
  const { prisma } = await import("@/server/db/prisma");
  const [row] = await prisma.$queryRaw<Array<{ count: number }>>(activityAccountCountSql(period));
  return row?.count ?? 0;
}
