import { authenticateUser } from "@/server/auth/session";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { guardServiceTerms } from "@/server/legal/requestGuard";
import { parsePlaceFamiliarity } from "@/shared/api/placeFamiliarity";
import { readPlaceFamiliarity, setPlaceFamiliarity } from "@/server/recommendations/familiarity";

export const runtime = "nodejs";
async function handle(request: Request, write: boolean) {
  const respond = (body: unknown, status = 200) => withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (!isRequestOriginAllowed(request)) return respond({ error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const denied = await guardServiceTerms(request); if (denied) return denied;
    const user = await authenticateUser(request); if (!user) return respond({ error: "사용자 확인이 필요해요." }, 401);
    let body: unknown;
    if (write) {
      const text = await request.text();
      if (text.length > 1024) return respond({ error: "장소 표시 요청을 확인해주세요." }, 413);
      body = JSON.parse(text);
    } else body = { placeId: new URL(request.url).searchParams.get("placeId"), familiar: false };
    const input = parsePlaceFamiliarity(body);
    if (!input) return respond({ error: "장소 표시 요청을 확인해주세요." }, 400);
    const result = write ? await setPlaceFamiliarity(user.id, input.placeId, input.familiar) : await readPlaceFamiliarity(user.id, input.placeId);
    return result ? respond(result) : respond({ error: "추천할 수 있는 장소를 찾지 못했어요." }, 404);
  } catch (error) {
    return respond({ error: error instanceof SyntaxError ? "장소 표시 요청을 확인해주세요." : "장소 표시를 확인하지 못했어요. 잠시 후 다시 시도해주세요." }, error instanceof SyntaxError ? 400 : 503);
  }
}
export function GET(request: Request) { return handle(request, false); }
export function PUT(request: Request) { return handle(request, true); }
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
