import { parseJournalEntryInput } from "@/server/journal/input";
import {
  deleteJournalEntry,
  updateJournalEntry,
} from "@/server/journal/service";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  DeleteJournalEntryResponse,
  JournalEntryResponse,
} from "@/shared/api/journal";

export const runtime = "nodejs";

type JournalEntryRouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function PATCH(
  request: Request,
  context: JournalEntryRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const [{ entryId }, body] = await Promise.all([
      context.params,
      request.json(),
    ]);
    const input = parseJournalEntryInput(body);

    if (!input) {
      return withCors(
        request,
        Response.json(
          { error: "기록 내용을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const entry = await updateJournalEntry(entryId, input);

    if (!entry) {
      return withCors(
        request,
        Response.json(
          { error: "수정할 기록을 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    const response: JournalEntryResponse = { entry };
    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("기록 수정 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "기록을 수정하지 못했어요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export async function DELETE(
  request: Request,
  context: JournalEntryRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const { entryId } = await context.params;
    const deleted = await deleteJournalEntry(entryId);

    if (!deleted) {
      return withCors(
        request,
        Response.json(
          { error: "삭제할 기록을 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    const response: DeleteJournalEntryResponse = { entryId };
    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("기록 삭제 중 오류가 발생했습니다.", error);

    return withCors(
      request,
      Response.json(
        { error: "기록을 삭제하지 못했어요." },
        { status: 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
