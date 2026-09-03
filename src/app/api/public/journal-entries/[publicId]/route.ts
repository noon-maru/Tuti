import { authenticateUser } from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { getPublicJournalEntry } from "@/server/journal/publication";
import type { PublicJournalEntryResponse } from "@/shared/api/journal";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const user = await authenticateUser(request);
  if (!user) {
    return withCors(request, Response.json({ error: "사용자 세션이 필요해요." }, { status: 401 }));
  }

  const { publicId } = await context.params;
  const entry = await getPublicJournalEntry(publicId, user.id);
  if (!entry) {
    return withCors(
      request,
      Response.json(
        { error: "공개 기록을 찾지 못했어요." },
        { status: 404, headers: privateNoStoreHeaders() },
      ),
    );
  }

  const response: PublicJournalEntryResponse = { entry };
  return withCors(
    request,
    Response.json(response, { headers: privateNoStoreHeaders() }),
  );
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function privateNoStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}
