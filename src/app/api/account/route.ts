import { randomUUID } from "node:crypto";
import { writeSystemLogSafely } from "@/server/admin/log";
import { deleteUserAccount } from "@/server/admin/users";
import { authenticateUser } from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AccountDeletionResponse } from "@/shared/api/session";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
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
          { error: "삭제할 사용자 세션을 확인해주세요." },
          { status: 401 },
        ),
      );
    }

    if (user.role === "admin") {
      return withCors(
        request,
        Response.json(
          { error: "관리자 계정은 관리자 화면에서 권한을 먼저 정리해주세요." },
          { status: 409 },
        ),
      );
    }

    const input = (await request.json()) as { confirmed?: unknown };
    if (input.confirmed !== true) {
      return withCors(
        request,
        Response.json(
          { error: "계정과 데이터가 복구되지 않는다는 내용을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const deletion = await deleteUserAccount(user.id);
    if (!deletion) {
      return withCors(
        request,
        Response.json(
          { error: "삭제할 계정을 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    const deletionReference = randomUUID();
    await writeSystemLogSafely({
      category: "account",
      action: "account.self.deleted",
      message: "사용자가 앱에서 계정과 관련 데이터를 삭제했습니다.",
      targetType: "account_deletion",
      targetId: deletionReference,
      metadata: {
        deletedJournalCount: deletion.deletedJournalCount,
        revokedAppleIdentityCount: deletion.revokedAppleIdentityCount,
      },
    });

    const response: AccountDeletionResponse = {
      deleted: true,
      deletionReference,
    };
    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("계정과 데이터를 삭제하지 못했습니다.", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "삭제 확인 내용을 확인해주세요."
            : "계정과 데이터를 모두 삭제하지 못했어요. 잠시 후 다시 시도해주세요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
