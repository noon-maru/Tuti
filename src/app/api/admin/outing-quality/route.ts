import { authenticateAdmin } from "@/server/admin/auth";
import { readOutingQuality } from "@/server/admin/outingQuality";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return withCors(request, auth.response);
  try { return withCors(request, Response.json(await readOutingQuality(), { headers: { "Cache-Control": "private, no-store" } })); }
  catch { return withCors(request, Response.json({ error: "나들이 품질을 확인하지 못했어요. 연결과 카탈로그 마이그레이션을 확인해주세요." }, { status: 503, headers: { "Cache-Control": "private, no-store" } })); }
}
export const OPTIONS = createPreflightResponse;
