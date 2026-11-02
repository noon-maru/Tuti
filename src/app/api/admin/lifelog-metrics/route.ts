import { authenticateAdmin } from "@/server/admin/auth";
import { analyticsPeriod, normalizeAnalyticsDays } from "@/server/admin/analyticsScope";
import { readLifelogStock } from "@/server/admin/lifelogStock";
import { readLifelogActivity } from "@/server/admin/lifelogActivity";
import { readEngagementMetrics } from "@/server/admin/engagementMetrics";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import type { LifelogMetricsResponse } from "@/shared/api/lifelogMetrics";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);
  try {
    const period = analyticsPeriod(normalizeAnalyticsDays(new URL(request.url).searchParams.get("days")));
    const [stock, activity, engagement] = await Promise.all([readLifelogStock(), readLifelogActivity(period), readEngagementMetrics(period)]);
    const response: LifelogMetricsResponse = { asOf: period.asOf, period: { days: period.days, start: period.start.toISOString(), end: period.end.toISOString() },
      observation: "current-surviving-data", stock, activity, engagement };
    return withCors(request, Response.json(response, { headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) {
    // 쿼리·바인딩 값·개인정보는 출력하지 않고 오류 분류만 남긴다.
    const failure = error && typeof error === "object" ? error as { code?: unknown; meta?: { code?: unknown } } : {};
    const code = typeof failure.code === "string" && /^P\d{4}$/.test(failure.code) ? failure.code : "UNKNOWN";
    const sqlState = typeof failure.meta?.code === "string" && /^[0-9A-Z]{5}$/.test(failure.meta.code) ? failure.meta.code : "UNKNOWN";
    console.error("라이프로그 지표 조회 실패", { code, sqlState });
    return withCors(request, Response.json({ error: "라이프로그 지표를 불러오지 못했어요. 마이그레이션과 연결 상태를 확인해주세요." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }));
  }
}
export const OPTIONS = createPreflightResponse;
