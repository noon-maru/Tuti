import { listLegalDocumentNotices } from "@/server/legal/documentNotice";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return withCors(request, Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 }));
  try { return withCors(request, Response.json({ notices: await listLegalDocumentNotices() }, { headers: { "Cache-Control": "no-store" } })); }
  catch { return withCors(request, Response.json({ error: "공고 원문을 확인하지 못했어요." }, { status: 503, headers: { "Cache-Control": "no-store" } })); }
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
