import { authenticateUser } from "@/server/auth/session";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { suggestJournalPlaces } from "@/server/places/suggestions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const json = (body: unknown, status = 200) => withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" } }));
  if (!isRequestOriginAllowed(request)) return json({ error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const user = await authenticateUser(request);
    if (!user) return json({ error: "사용자 인증이 필요해요." }, 401);
    return json(await suggestJournalPlaces(user.id, new URL(request.url).searchParams.get("q") ?? ""));
  } catch {
    // 검색어나 과거 장소명을 오류 로그에 남기지 않는다.
    console.error("마디 장소 제안을 불러오지 못했습니다.");
    return json({ error: "장소 제안을 불러오지 못했어요. 직접 입력해도 괜찮아요." }, 500);
  }
}

export function OPTIONS(request: Request) { return createPreflightResponse(request); }
