import { authenticateAdmin } from "@/server/admin/auth";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";

export const runtime = "nodejs";

// 추천을 핵심 전환으로 간주하던 지표는 종료했다. 새 응답을 옛 계약인 것처럼 반환하지 않는다.
export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);
  return withCors(request, Response.json({
    error: "기존 사업 지표는 종료됐습니다. 제품 성과에서 라이프로그 지표를 확인해주세요.",
    replacement: "/api/admin/lifelog-metrics",
  }, { status: 410, headers: { "Cache-Control": "private, no-store", Link: '</api/admin/lifelog-metrics>; rel="successor-version"' } }));
}

export const OPTIONS = createPreflightResponse;
