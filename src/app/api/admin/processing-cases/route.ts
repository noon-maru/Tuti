import { authenticateAdmin } from "@/server/admin/auth";
import { createProcessingCase, listProcessingCases } from "@/server/admin/processingCases";
import { prisma } from "@/server/db/prisma";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { parseAdminJournalPurpose } from "@/shared/legal/adminJournalAccess";

export const runtime = "nodejs";
async function handle(request: Request, create: boolean) {
  const respond = (body: unknown, status = 200) => withCors(request, Response.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  }));
  if (!isRequestOriginAllowed(request)) return respond({ error: "허용되지 않은 요청 출처예요." }, 403);
  const auth = await authenticateAdmin(request);
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "private, no-store");
    return withCors(request, auth.response);
  }
  const userId = new URL(request.url).searchParams.get("userId") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return respond({ error: "사용자를 확인해주세요." }, 400);
  }
  const input = create ? await request.json().catch(() => null) : null;
  const purpose = parseAdminJournalPurpose(input?.purpose);
  if (create && !purpose) return respond({ error: "처리 목적을 선택해주세요." }, 400);
  try {
    if (!await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) {
      return respond({ error: "사용자를 찾지 못했습니다." }, 404);
    }
    return create
      ? respond({ processingCase: await createProcessingCase(userId, auth.user.id, purpose!) }, 201)
      : respond({ cases: await listProcessingCases(userId) });
  } catch {
    return respond({ error: "처리 요청을 저장하거나 불러오지 못했어요. 다시 시도해주세요." }, 500);
  }
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
export const OPTIONS = createPreflightResponse;
