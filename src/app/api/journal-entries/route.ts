import { getJournalEntries } from "@/server/journal/service";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { JournalEntriesResponse } from "@/shared/api/journal";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const response: JournalEntriesResponse = {
      entries: await getJournalEntries(),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("기록 API 처리 중 오류가 발생했습니다.", error);

    return withCors(
      request,
      Response.json(
        { error: "기록을 불러오지 못했어요." },
        { status: 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
