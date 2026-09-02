import { writeSystemLogSafely } from "@/server/admin/log";
import {
  getRequiredAuthEnv,
} from "@/server/auth/config";
import { revokeAppleRefreshToken } from "@/server/auth/appleOAuth";
import {
  AccountAuthError,
  authenticateUser,
  createAccountProfile,
} from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AccountIdentityUnlinkResponse } from "@/shared/api/session";

export const runtime = "nodejs";

type IdentityRouteContext = {
  params: Promise<{ identityId: string }>;
};

export async function DELETE(
  request: Request,
  context: IdentityRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const currentUser = await authenticateUser(request);
    if (!currentUser?.account) {
      return withCors(
        request,
        Response.json(
          { error: "로그인 계정을 확인해주세요." },
          { status: 401 },
        ),
      );
    }

    const input = (await request.json()) as { confirmed?: unknown };
    if (input.confirmed !== true) {
      return withCors(
        request,
        Response.json(
          { error: "로그인 수단 연결 해제 내용을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const { identityId } = await context.params;
    const identities = await prisma.authIdentity.findMany({
      where: { userId: currentUser.id },
      select: {
        id: true,
        provider: true,
        providerRefreshTokenEncrypted: true,
      },
    });
    const identity = identities.find((candidate) => candidate.id === identityId);

    if (!identity) {
      return withCors(
        request,
        Response.json(
          { error: "연결 해제할 로그인 수단을 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    if (identities.length <= 1) {
      return withCors(
        request,
        Response.json(
          { error: "계정을 계속 이용하려면 로그인 수단을 하나 이상 남겨주세요." },
          { status: 409 },
        ),
      );
    }

    if (
      identity.provider === "apple" &&
      identity.providerRefreshTokenEncrypted
    ) {
      await revokeAppleRefreshToken(
        identity.providerRefreshTokenEncrypted,
        {
          clientId: getRequiredAuthEnv("APPLE_CLIENT_ID"),
          teamId: getRequiredAuthEnv("APPLE_TEAM_ID"),
          keyId: getRequiredAuthEnv("APPLE_KEY_ID"),
          privateKey: getRequiredAuthEnv("APPLE_PRIVATE_KEY"),
          encryptionKey: getRequiredAuthEnv("APPLE_TOKEN_ENCRYPTION_KEY"),
        },
      );
    }

    await prisma.$transaction(
      async (transaction) => {
        const remainingIdentityCount = await transaction.authIdentity.count({
          where: { userId: currentUser.id },
        });
        if (remainingIdentityCount <= 1) {
          throw new AccountAuthError(
            "계정을 계속 이용하려면 로그인 수단을 하나 이상 남겨주세요.",
            "last_account_identity",
            409,
          );
        }

        await transaction.authIdentity.delete({
          where: { id: identity.id, userId: currentUser.id },
        });
      },
      { isolationLevel: "Serializable" },
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: currentUser.id },
      select: {
        displayName: true,
        role: true,
        authIdentities: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, email: true, provider: true },
        },
      },
    });
    const account = createAccountProfile(
      user.displayName,
      user.authIdentities,
      user.role,
    );

    if (!account) {
      throw new Error("로그인 수단이 모두 제거되었습니다.");
    }

    await writeSystemLogSafely({
      category: "account",
      action: "account.identity.unlinked",
      message: "사용자가 로그인 수단 연결을 해제했습니다.",
      actorUserId: currentUser.id,
      targetType: "auth_identity",
      targetId: identity.id,
      metadata: { provider: identity.provider },
    });

    const response: AccountIdentityUnlinkResponse = {
      unlinked: true,
      account,
    };
    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    const accountError = error instanceof AccountAuthError ? error : null;
    if (!invalidJson && !accountError) {
      console.error("로그인 수단 연결을 해제하지 못했습니다.", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }

    return withCors(
      request,
      Response.json(
        {
          error:
            accountError?.message ??
            (invalidJson
              ? "연결 해제 확인 내용을 확인해주세요."
              : "로그인 수단 연결을 해제하지 못했어요. 잠시 후 다시 시도해주세요."),
        },
        { status: accountError?.status ?? (invalidJson ? 400 : 500) },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
