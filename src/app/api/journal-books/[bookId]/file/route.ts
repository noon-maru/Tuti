import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { getObject } from "@/server/storage/objectStorage";

export const runtime = "nodejs";

type Context = { params: Promise<{ bookId: string }> };

export async function GET(request: Request, context: Context) {
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
    const book = await prisma.journalBook.findFirst({
      where: { id: bookId, ownerId: user.id },
      select: { objectKey: true },
    });
    if (!book)
      return withCors(
        request,
        Response.json({ error: "기록집을 찾지 못했어요." }, { status: 404 }),
      );
    const stored = await getObject(book.objectKey);
    const bytes = await stored.body.transformToByteArray();
    return withCors(
      request,
      new Response(new Uint8Array(bytes).buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline; filename=tuti-journal-book.pdf",
          "Cache-Control": "private, no-store",
        },
      }),
    );
  } catch (error) {
    console.error("완성한 기록집 파일을 불러오지 못했습니다.", error);
    return withCors(
      request,
      Response.json({ error: "기록집 파일을 불러오지 못했어요." }, { status: 500 }),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
