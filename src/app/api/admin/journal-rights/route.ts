import { authenticateAdmin } from "@/server/admin/auth";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { actOnRightsCase, createRightsCase, listRightsCases } from "@/server/legal/journalRights";
import { RightsWorkflowError } from "@/shared/legal/journalRights";

export const runtime = "nodejs";
async function handle(request: Request, write: boolean) {
  if (!isRequestOriginAllowed(request)) return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);
  const respond = (body: unknown, status = 200) => withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
  try {
    if (write) {
      const body: unknown = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new RightsWorkflowError("요청 내용을 확인해주세요.");
      const input = body as Record<string, unknown>;
      if (input.action === "create") await createRightsCase(input, authentication.user.id);
      else await actOnRightsCase(input, authentication.user.id);
    }
    return respond(await listRightsCases());
  } catch (error) {
    if (error instanceof RightsWorkflowError) return respond({ error: error.message }, error.status);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return respond({ error: "이미 사용 중인 신고·사건 번호예요. 목록을 새로고침해주세요." }, 409);
    // DB/연락처/증빙 데이터가 응답이나 콘솔에 노출되지 않도록 고정 오류만 반환한다.
    return respond({ error: "권리 침해 처리 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요." }, 503);
  }
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
export const OPTIONS = createPreflightResponse;
