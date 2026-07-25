import { assertAccountAuthEnabled } from "@/server/auth/config";
import { verifyEmailCode } from "@/server/auth/emailCode";
import {
  AccountAuthError,
  authenticateUser,
} from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  EmailCodeVerification,
  SessionResponse,
} from "@/shared/api/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    assertAccountAuthEnabled();
    const currentUser = await authenticateUser(request);

    if (!currentUser) {
      return withCors(
        request,
        Response.json(
          { error: "사용자 인증이 필요해요." },
          { status: 401 },
        ),
      );
    }

    const input = (await request.json()) as EmailCodeVerification;
    const response: SessionResponse = {
      session: await verifyEmailCode(currentUser, input),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    const accountError =
      error instanceof AccountAuthError ? error : null;

    if (!accountError && !(error instanceof SyntaxError)) {
      console.error("인증코드 확인 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error:
            accountError?.message ??
            (error instanceof SyntaxError
              ? "입력 내용을 확인해주세요."
              : "인증코드를 확인하지 못했어요."),
          code: accountError?.code,
        },
        {
          status:
            accountError?.status ??
            (error instanceof SyntaxError ? 400 : 500),
        },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
