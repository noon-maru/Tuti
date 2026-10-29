import sharp from "sharp";
import { prisma } from "@/server/db/prisma";
import { getObject } from "@/server/storage/objectStorage";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import { requireHarumadiAccess, requireTogether } from "@/server/harumadi/access";
import { readSharedImageTicket } from "@/server/harumadi/media";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ harumadiId: string; entryId: string }> }) {
  const fail = () => withCors(request, new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } }));
  if (!isRequestOriginAllowed(request)) return fail();
  try {
    requireTogether();
    const { harumadiId, entryId } = await context.params;
    const scope = readSharedImageTicket(new URL(request.url).searchParams.get("ticket"));
    if (!scope || scope.bookId !== harumadiId || scope.entryId !== entryId) return fail();
    const entry = await prisma.$transaction(async tx => {
      const book = await requireHarumadiAccess(tx, scope.userId, harumadiId);
      if (book.accessRevision !== scope.accessRevision) return null;
      return tx.journalEntry.findFirst({ where: { id: entryId, sensitiveContent: false, sensitiveWithdrawnAt: null, harumadiEntries: { some: { harumadiId } } }, select: { image: true } });
    });
    if (!entry?.image || !isStoredJournalImage(entry.image)) return fail();
    const object = await getObject(entry.image);
    if (object.contentLength && object.contentLength > 5 * 1024 * 1024) return fail();
    const bytes = await object.body.transformToByteArray();
    if (bytes.length > 5 * 1024 * 1024) return fail();
    const image = new URL(request.url).searchParams.has("thumbnail") ? await sharp(bytes, { limitInputPixels: 16_000_000 }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer() : bytes;
    return withCors(request, new Response(new Uint8Array(image), { headers: { "Content-Type": new URL(request.url).searchParams.has("thumbnail") ? "image/jpeg" : object.contentType ?? "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } }));
  } catch { return fail(); }
}
export const OPTIONS = createPreflightResponse;
