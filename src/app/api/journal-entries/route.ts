import { parseJournalEntryInput } from "@/server/journal/input";
import {
  createJournalEntry,
  getJournalEntries,
} from "@/server/journal/service";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  JournalEntriesResponse,
  JournalEntryResponse,
} from "@/shared/api/journal";

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

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const input = parseJournalEntryInput(await request.json());

    if (!input) {
      return withCors(
        request,
        Response.json(
          { error: "기록 내용을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const response: JournalEntryResponse = {
      entry: await createJournalEntry(input),
    };

    return withCors(
      request,
      Response.json(response, { status: 201 }),
    );
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("기록 생성 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "기록을 저장하지 못했어요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
