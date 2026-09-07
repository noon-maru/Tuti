import sharp from "sharp";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { createBookPreviewHandler } from "@/server/journal/bookPreview";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import {
  renderJournalBook,
  type PreparedBookEntry,
} from "@/server/pdf/journalBook";
import { getObject } from "@/server/storage/objectStorage";

export const runtime = "nodejs";

const preview = createBookPreviewHandler({
  authenticate: authenticateUser,
  findEntries: (ownerId, ids) =>
    prisma.journalEntry.findMany({
      where: { ownerId, id: { in: ids } },
      select: {
        id: true,
        title: true,
        content: true,
        placeName: true,
        visitedAt: true,
        image: true,
      },
    }),
  async render(input, entries) {
    const prepared: PreparedBookEntry[] = [];
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
    return renderJournalBook(input, prepared);
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
