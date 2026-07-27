import { authenticateUser } from "@/server/auth/session";
import { issueJournalShareTrace } from "@/server/journal/shareTrace";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { JournalShareTraceIssueResponse } from "@/shared/api/journal";

export const runtime = "nodejs";

type JournalShareTraceRouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function POST(
  request: Request,
  context: JournalShareTraceRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const user = await authenticateUser(request);

    if (!user) return unauthorizedResponse(request);

    const { entryId } = await context.params;
    const trace = await issueJournalShareTrace(user.id, entryId);

    if (!trace) {
      return withCors(
        request,
        Response.json(
          { error: "공유할 기록을 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    const response: JournalShareTraceIssueResponse = { trace };
    return withCors(
      request,
      Response.json(response, { status: 201 }),
    );
  } catch (error) {
    console.error("공유 이미지 추적 번호를 만들지 못했습니다.", error);

    return withCors(
      request,
      Response.json(
        { error: "공유 이미지 추적 번호를 만들지 못했어요." },
        { status: 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function unauthorizedResponse(request: Request) {
  return withCors(
    request,
    Response.json(
      { error: "사용자 인증이 필요해요." },
      { status: 401 },
    ),
  );
}
