import { authenticateUser } from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { deleteJournalBook } from "@/server/journal/bookDeletion";

export const runtime = "nodejs";

type Context = { params: Promise<{ bookId: string }> };

export async function DELETE(request: Request, context: Context) {
  if (!isRequestOriginAllowed(request))
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  try {
    const user = await authenticateUser(request);
    if (!user)
      return withCors(
        request,
        Response.json({ error: "사용자 인증이 필요해요." }, { status: 401 }),
      );
    const { bookId } = await context.params;
    if (!await deleteJournalBook(user.id, bookId))
      return withCors(
        request,
        Response.json({ error: "삭제할 기록집을 찾지 못했어요." }, { status: 404 }),
      );
    return withCors(request, Response.json({ bookId }));
  } catch (error) {
    console.error("기록집을 삭제하지 못했습니다.", error);
    return withCors(
      request,
      Response.json({ error: "기록집을 삭제하지 못했어요." }, { status: 500 }),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
