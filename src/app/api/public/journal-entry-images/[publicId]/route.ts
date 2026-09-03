import { getPublicJournalImage } from "@/server/journal/publication";
import { authenticateUser } from "@/server/auth/session";
import { getObject } from "@/server/storage/objectStorage";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";

export const runtime = "nodejs";

type PublicJournalImageRouteContext = {
  params: Promise<{ publicId: string }>;
};

export async function GET(
  request: Request,
  context: PublicJournalImageRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const user = await authenticateUser(request);
    if (!user) return notFoundResponse(request);
    const { publicId } = await context.params;
    const imageKey = await getPublicJournalImage(publicId, user.id);

    if (!imageKey) return notFoundResponse(request);

    const image = await getObject(imageKey);
    const body = await image.body.transformToByteArray();
    const responseBody = new Uint8Array(body.byteLength);
    responseBody.set(body);
    const headers = new Headers({
      "Cache-Control": "no-store",
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
    console.error("공개 기록 이미지를 불러오지 못했습니다.", error);
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
      { error: "공개 이미지를 찾지 못했어요." },
      { status: 404 },
    ),
  );
}
