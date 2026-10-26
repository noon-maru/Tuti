import { authenticateUser } from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { deleteHarumadiPdf } from "@/server/harumadi/pdfDeletion";
import { findReadableHarumadiPdf } from "@/server/harumadi/readablePdf";

export const runtime = "nodejs";

type Context = { params: Promise<{ harumadiPdfId: string }> };

export async function GET(request: Request, context: Context) {
  const response = (body: unknown, status = 200) => withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (!isRequestOriginAllowed(request)) return response({ error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const user = await authenticateUser(request);
    if (!user) return response({ error: "사용자 인증이 필요해요." }, 401);
    const result = await findReadableHarumadiPdf(user.id, (await context.params).harumadiPdfId);
    if (!result.harumadiPdf) return response({ error: result.error }, result.status);
    const harumadiPdf = result.harumadiPdf;
    return response({ harumadiPdf: { id: harumadiPdf.id, title: harumadiPdf.title, entryCount: harumadiPdf.entryIds.length, pageCount: harumadiPdf.pageCount,
      createdAt: harumadiPdf.createdAt.toISOString(), coverStyle: harumadiPdf.coverStyle, hasCover: harumadiPdf.coverReady } });
  } catch { return response({ error: "하루마디를 불러오지 못했어요." }, 503); }
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
    const { harumadiPdfId } = await context.params;
    if (!await deleteHarumadiPdf(user.id, harumadiPdfId))
      return withCors(
        request,
        Response.json({ error: "삭제할 하루마디를 찾지 못했어요." }, { status: 404 }),
      );
    return withCors(request, Response.json({ harumadiPdfId }));
  } catch (error) {
    console.error("하루마디를 삭제하지 못했습니다.", error);
    return withCors(
      request,
      Response.json({ error: "하루마디를 삭제하지 못했어요." }, { status: 500 }),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
