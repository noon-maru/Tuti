import { authenticateAdmin } from "@/server/admin/auth";
import { analyticsPeriod, normalizeAnalyticsDays } from "@/server/admin/analyticsScope";
import { readLifelogStock } from "@/server/admin/lifelogStock";
import { readLifelogActivity } from "@/server/admin/lifelogActivity";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import type { LifelogMetricsResponse } from "@/shared/api/lifelogMetrics";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);
  try {
    const period = analyticsPeriod(normalizeAnalyticsDays(new URL(request.url).searchParams.get("days")));
    const [stock, activity] = await Promise.all([readLifelogStock(), readLifelogActivity(period)]);
    const response: LifelogMetricsResponse = { asOf: period.asOf, period: { days: period.days, start: period.start.toISOString(), end: period.end.toISOString() },
      observation: "current-surviving-data", stock, activity };
    return withCors(request, Response.json(response, { headers: { "Cache-Control": "private, no-store" } }));
  } catch {
    return withCors(request, Response.json({ error: "라이프로그 지표를 불러오지 못했어요. 마이그레이션과 연결 상태를 확인해주세요." }, { status: 503 }));
  }
}
export const OPTIONS = createPreflightResponse;
