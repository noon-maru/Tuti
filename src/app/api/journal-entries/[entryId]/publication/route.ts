import { authenticateUser } from "@/server/auth/session";
import {
  JournalPublicationStateError,
  setJournalEntryPublication,
} from "@/server/journal/service";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { JournalPublicationResponse } from "@/shared/api/journal";
import {
  canAccountPublishJournal,
  journalPublicationEnabled,
} from "@/shared/features/release";

export const runtime = "nodejs";

type JournalPublicationRouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function PATCH(
  request: Request,
  context: JournalPublicationRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const user = await authenticateUser(request);

    if (!user) {
      return withCors(
        request,
        Response.json(
          { error: "사용자 인증이 필요해요." },
          { status: 401 },
        ),
      );
    }

    const input = (await request.json()) as { published?: unknown };

    if (typeof input.published !== "boolean") {
      return withCors(
        request,
        Response.json(
          { error: "공개 설정을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    if (input.published && !journalPublicationEnabled) {
      return withCors(
        request,
        Response.json(
          { error: "인터넷 공개 기능은 현재 제공하지 않아요." },
          { status: 403 },
        ),
      );
    }

    if (input.published && !user.account) {
      return withCors(
        request,
        Response.json(
          {
            error: "기록을 공개하려면 먼저 계정을 연결해주세요.",
            code: "account_required",
          },
          { status: 403 },
        ),
      );
    }

    if (input.published && !canAccountPublishJournal(user.account?.role)) {
      return withCors(
        request,
        Response.json(
          { error: "기록 웹 공유를 내부에서 점검하고 있어요." },
          { status: 403 },
        ),
      );
    }

    const { entryId } = await context.params;
    const entry = await setJournalEntryPublication(
      user.id,
      entryId,
      input.published,
    );

    if (!entry) {
      return withCors(
        request,
        Response.json(
          { error: "공개 설정을 바꿀 기록을 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    const response: JournalPublicationResponse = { entry };
    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    const invalidState = error instanceof JournalPublicationStateError;

    if (!invalidJson) {
      console.error("기록 공개 설정을 변경하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : invalidState
              ? error.message
            : "기록 공개 설정을 변경하지 못했어요.",
        },
        { status: invalidJson ? 400 : invalidState ? 409 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
