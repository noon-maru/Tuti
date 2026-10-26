import sharp from "sharp";
import { prisma } from "@/server/db/prisma";
import { authenticateUser } from "@/server/auth/session";
import { findReadableBook } from "@/server/journal/readableBook";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { guardServiceTerms } from "@/server/legal/requestGuard";

export const runtime = "nodejs";
type Context = { params: Promise<{ bookId: string }> };
const fail = (request: Request, error: string, status: number) => withCors(request, Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } }));

export async function GET(request: Request, context: Context) {
  if (!isRequestOriginAllowed(request)) return fail(request, "허용되지 않은 요청 출처예요.", 403);
  try {
    const user = await authenticateUser(request);
    if (!user) return fail(request, "사용자 인증이 필요해요.", 401);
    const result = await findReadableBook(user.id, (await context.params).bookId);
    if (!result.book) return fail(request, result.error!, result.status);
    const row = await prisma.journalBook.findFirst({ where: { id: result.book.id, ownerId: user.id }, select: { coverThumbnail: true } });
    if (!row?.coverThumbnail) return fail(request, "표지를 준비하고 있어요.", 404);
    return withCors(request, new Response(new Uint8Array(row.coverThumbnail).buffer, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } }));
  } catch { return fail(request, "표지를 불러오지 못했어요.", 503); }
}

export async function POST(request: Request, context: Context) {
  if (!isRequestOriginAllowed(request)) return fail(request, "허용되지 않은 요청 출처예요.", 403);
  try {
    const denied = await guardServiceTerms(request);
    if (denied) return denied;
    const user = await authenticateUser(request);
    if (!user) return fail(request, "사용자 인증이 필요해요.", 401);
    const result = await findReadableBook(user.id, (await context.params).bookId);
    if (!result.book) return fail(request, result.error!, result.status);
    if (result.book.coverReady) return withCors(request, Response.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } }));
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "image/jpeg") return fail(request, "JPEG 표지 이미지가 필요해요.", 415);
    const reader = request.body?.getReader();
    if (!reader) return fail(request, "표지 이미지가 필요해요.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const item = await reader.read(); if (item.done) break;
        size += item.value.byteLength;
        if (size > 131072) { await reader.cancel(); return fail(request, "표지 이미지가 너무 커요.", 413); }
        chunks.push(item.value);
      }
    } finally { reader.releaseLock(); }
    let image: Buffer;
    try {
      const source = sharp(Buffer.concat(chunks), { limitInputPixels: 4_000_000, animated: false });
      if ((await source.metadata()).format !== "jpeg") return fail(request, "JPEG 표지 이미지가 필요해요.", 415);
      image = await source.rotate()
      .resize({ width: 320, height: 460, fit: "inside", withoutEnlargement: true }).flatten({ background: "#FFFFFF" }).jpeg({ quality: 80 }).toBuffer(); }
    catch { return fail(request, "표지 이미지를 확인해주세요.", 400); }
    if (image.length > 98304) return fail(request, "표지 이미지가 너무 커요.", 413);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM journal_entries WHERE owner_id = ${user.id} AND id = ANY(${result.book.entryIds}::text[]) ORDER BY id FOR UPDATE`;
      const withdrawn = await tx.journalEntry.count({ where: { ownerId: user.id, id: { in: result.book.entryIds }, sensitiveWithdrawnAt: { not: null } } });
      if (withdrawn) throw new Error("withdrawn");
      const saved = await tx.journalBook.updateMany({ where: { id: result.book.id, ownerId: user.id, coverReady: false }, data: { coverThumbnail: new Uint8Array(image), coverReady: true } });
      if (!saved.count && !(await tx.journalBook.findFirst({ where: { id: result.book.id, ownerId: user.id, coverReady: true }, select: { id: true } }))) throw new Error("book-deleted");
    });
    return withCors(request, Response.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } }));
  } catch { return fail(request, "표지를 보관하지 못했어요.", 503); }
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
