import sharp from "sharp";
import { assertSensitiveJournalReadable, assertHarumadiPdfFreeform } from "@/server/journal/sensitivePolicy";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { createHarumadiPdfPreviewHandler } from "@/server/harumadi/pdfPreview";
import { createHarumadiPdfApproval } from "@/server/harumadi/pdfApproval";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import {
  renderHarumadiPdf,
  type PreparedHarumadiPdfEntry,
} from "@/server/pdf/harumadiPdf";
import { getObject } from "@/server/storage/objectStorage";
import { requireHarumadiAccess, requireTogether } from "@/server/harumadi/access";

export const runtime = "nodejs";

const preview = createHarumadiPdfPreviewHandler({
  validate: assertHarumadiPdfFreeform,
  authenticate: authenticateUser,
  approve: createHarumadiPdfApproval,
  findEntries: async (ownerId, ids, input) => {
    if (input.harumadiId) {
      requireTogether();
      return prisma.$transaction(async tx => {
        await requireHarumadiAccess(tx, ownerId, input.harumadiId!);
        const entries = await tx.journalEntry.findMany({ where: { id: { in: ids }, sensitiveContent: false, sensitiveWithdrawnAt: null, harumadiEntries: { some: { harumadiId: input.harumadiId } } } });
        return entries;
      }, { isolationLevel: "RepeatableRead" });
    }
    const entries = await prisma.journalEntry.findMany({
      where: { ownerId, id: { in: ids } },
      select: {
        id: true,
        title: true,
        content: true,
        placeName: true,
        visitedAt: true,
        image: true,
        sensitiveContent: true,
        sensitiveConsentVersion: true,
        sensitiveWithdrawnAt: true,
      },
    });
    entries.forEach((entry) => assertSensitiveJournalReadable(entry));
    return entries;
  },
  async render(input, entries) {
    const prepared: PreparedHarumadiPdfEntry[] = [];
    for (const entry of entries) {
      let image: Buffer | null = null;
      if (entry.image) {
        // Only trusted storage keys from the owner's records; never fetch input URLs.
        if (!isStoredJournalImage(entry.image))
          throw new Error("Unsupported image source");
        const stored = await getObject(entry.image);
        if (stored.contentLength && stored.contentLength > 5 * 1024 * 1024)
          throw new Error("Image too large");
        const bytes = await stored.body.transformToByteArray();
        if (bytes.byteLength > 5 * 1024 * 1024)
          throw new Error("Image too large");
        image = await sharp(bytes, { limitInputPixels: 16_000_000 })
          .rotate()
          .resize({
            width: 1200,
            height: 1200,
            fit: "inside",
            withoutEnlargement: true,
          })
          .flatten({ background: "#FFFFFF" })
          .jpeg({ quality: 88 })
          .toBuffer();
      }
      prepared.push({ ...entry, image });
    }
    return renderHarumadiPdf(input, prepared);
  },
});

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request))
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  return withCors(request, await preview(request));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
