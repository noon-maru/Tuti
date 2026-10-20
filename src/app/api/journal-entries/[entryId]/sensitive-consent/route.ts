import { authenticateUser } from "@/server/auth/session";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { withdrawSensitiveJournal } from "@/server/journal/sensitiveWithdrawal";

export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ entryId: string }> }) {
  if (!isRequestOriginAllowed(request)) return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  try {
    const user = await authenticateUser(request);
    if (!user) return withCors(request, Response.json({ error: "사용자 인증이 필요해요." }, { status: 401 }));
    const { entryId } = await context.params;
    const result = await withdrawSensitiveJournal(user.id, entryId);
    return withCors(request, Response.json(result, { status: !result.found ? 404 : result.pending ? 202 : 200 }));
  } catch {
    return withCors(request, Response.json({ error: "철회 요청을 처리하지 못했어요. 다시 시도해주세요." }, { status: 500 }));
  }
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
