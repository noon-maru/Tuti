import { authenticateUser } from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { deleteJournalBook } from "@/server/journal/bookDeletion";
import { findReadableBook } from "@/server/journal/readableBook";

export const runtime = "nodejs";

type Context = { params: Promise<{ bookId: string }> };

export async function GET(request: Request, context: Context) {
  const response = (body: unknown, status = 200) => withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (!isRequestOriginAllowed(request)) return response({ error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const user = await authenticateUser(request);
    if (!user) return response({ error: "사용자 인증이 필요해요." }, 401);
    const result = await findReadableBook(user.id, (await context.params).bookId);
    if (!result.book) return response({ error: result.error }, result.status);
    const book = result.book;
    return response({ book: { id: book.id, title: book.title, entryCount: book.entryIds.length, pageCount: book.pageCount,
      createdAt: book.createdAt.toISOString(), coverStyle: book.coverStyle, hasCover: book.coverReady } });
  } catch { return response({ error: "기록집을 불러오지 못했어요." }, 503); }
}

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
