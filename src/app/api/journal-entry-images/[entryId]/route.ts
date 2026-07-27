import { prisma } from "@/server/db/prisma";
import {
  isStoredJournalImage,
  verifyJournalImageSignature,
} from "@/server/journal/imageStorage";
import { getObject } from "@/server/storage/objectStorage";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";

export const runtime = "nodejs";

type JournalImageRouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function GET(
  request: Request,
  context: JournalImageRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const { entryId } = await context.params;
    const signature = new URL(request.url).searchParams.get("signature");

    if (!signature) return notFoundResponse(request);

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        ownerId: true,
        image: true,
        updatedAt: true,
      },
    });

    if (
      !entry ||
      !entry.image ||
      !isStoredJournalImage(entry.image) ||
      !verifyJournalImageSignature(entry, signature)
    ) {
      return notFoundResponse(request);
    }

    const image = await getObject(entry.image);
    const body = await image.body.transformToByteArray();
    const responseBody = new Uint8Array(body.byteLength);
    responseBody.set(body);
    const headers = new Headers({
      "Cache-Control": image.cacheControl ??
        "private, max-age=31536000, immutable",
      "Content-Type": image.contentType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    if (image.etag) headers.set("ETag", image.etag);
    if (image.contentLength !== undefined) {
      headers.set("Content-Length", String(image.contentLength));
    }

    return withCors(
      request,
      new Response(responseBody.buffer, { headers }),
    );
  } catch (error) {
    console.error("저널 이미지를 불러오지 못했습니다.", error);
    return notFoundResponse(request);
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function notFoundResponse(request: Request) {
  return withCors(
    request,
    Response.json(
      { error: "이미지를 찾지 못했어요." },
      { status: 404 },
    ),
  );
}
