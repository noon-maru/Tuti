import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { sensitiveJournalPolicyEnabled } from "@/server/journal/sensitivePolicy";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";
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
      select: { objectKey: true, entryIds: true, sensitivePolicyVersion: true },
    });
    if (!book)
      return withCors(
        request,
        Response.json({ error: "기록집을 찾지 못했어요." }, { status: 404 }),
      );
    const withdrawn = await prisma.journalEntry.count({ where: { ownerId: user.id, id: { in: book.entryIds }, sensitiveWithdrawnAt: { not: null } } });
    if (withdrawn) return withCors(request, Response.json({ error: "동의 철회로 정리 중인 기록집이에요." }, { status: 410 }));
    if (sensitiveJournalPolicyEnabled() && book.sensitivePolicyVersion !== SENSITIVE_JOURNAL_CONSENT_VERSION) {
      return withCors(request, Response.json({ error: "이전 기록집은 기록 보호 확인이 필요해요. 기록을 확인한 뒤 기록집을 새로 만들어주세요." }, { status: 409 }));
    }
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
