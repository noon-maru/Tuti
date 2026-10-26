import sharp from "sharp";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { readHarumadi, HarumadiError } from "@/server/harumadi/service";
import { assertSensitiveJournalReadable, SensitiveJournalPolicyError } from "@/server/journal/sensitivePolicy";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import { getObject } from "@/server/storage/objectStorage";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ harumadiId: string }> }) {
  const fail = (error: string, status: number) => withCors(request, Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (!isRequestOriginAllowed(request)) return fail("허용되지 않은 요청 출처예요.", 403);
  try {
    const user = await authenticateUser(request);
    if (!user) return fail("사용자 인증이 필요해요.", 401);
    const harumadi = await readHarumadi(user.id, (await context.params).harumadiId);
    if (!harumadi.coverStyle.endsWith("-image")) return fail("사진 표지가 아니에요.", 404);
    const entry = await prisma.journalEntry.findFirst({ where: { ownerId: user.id, id: { in: harumadi.entryIds }, image: { not: null }, sensitiveWithdrawnAt: null },
      select: { image: true, sensitiveContent: true, sensitiveConsentVersion: true, sensitiveWithdrawnAt: true }, orderBy: [{ visitedAt: "asc" }, { id: "asc" }] });
    if (!entry?.image || !isStoredJournalImage(entry.image)) return fail("사진을 담으면 표지가 채워져요.", 404);
    assertSensitiveJournalReadable(entry);
    const source = await getObject(entry.image);
    if (source.contentLength && source.contentLength > 5 * 1024 * 1024) return fail("표지 사진이 너무 커요.", 413);
    const bytes = await source.body.transformToByteArray();
    if (bytes.byteLength > 5 * 1024 * 1024) return fail("표지 사진이 너무 커요.", 413);
    const photo = await sharp(bytes, { limitInputPixels: 16_000_000 }).rotate().resize({ width: 240, height: 190, fit: "inside" }).flatten({ background: "#FFFFFF" }).jpeg({ quality: 80 }).toBuffer();
    // 사진만 축소하며 제목·표지 색은 실제 컴포넌트가 렌더한다.
    return withCors(request, new Response(new Uint8Array(photo).buffer, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } }));
  } catch (error) {
    if (error instanceof HarumadiError || error instanceof SensitiveJournalPolicyError) return fail(error.message, error.status);
    return fail("표지 사진을 불러오지 못했어요.", 503);
  }
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
