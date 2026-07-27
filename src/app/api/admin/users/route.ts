import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { forceDeleteUser } from "@/server/admin/users";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminUsersResponse } from "@/shared/api/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const query = new URL(request.url).searchParams
    .get("q")
    ?.trim()
    .slice(0, 120);
  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { id: { contains: query, mode: "insensitive" } },
            {
              authIdentities: {
                some: {
                  email: { contains: query, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : undefined,
    select: {
      id: true,
      role: true,
      createdAt: true,
      authIdentities: {
        select: {
          email: true,
          provider: true,
        },
      },
      _count: {
        select: {
          journalEntries: true,
        },
      },
    },
    orderBy: [{ role: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const response: AdminUsersResponse = {
    users: users.map((user) => ({
      id: user.id,
      role: user.role,
      email:
        user.authIdentities.find((identity) => identity.email)?.email ?? null,
      providers: Array.from(
        new Set(user.authIdentities.map((identity) => identity.provider)),
      ),
      journalCount: user._count.journalEntries,
      createdAt: user.createdAt.toISOString(),
    })),
  };

  return withCors(request, Response.json(response));
}

export async function PATCH(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  try {
    const body = (await request.json()) as {
      userId?: unknown;
      role?: unknown;
    };
    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";
    const role = normalizeRole(body.role);

    if (!userId || !role) {
      return withCors(
        request,
        Response.json({ error: "권한 변경값을 확인해주세요." }, { status: 400 }),
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!currentUser) {
      return withCors(
        request,
        Response.json({ error: "사용자를 찾지 못했습니다." }, { status: 404 }),
      );
    }

    if (currentUser.role === "admin" && role === "user") {
      const adminCount = await prisma.user.count({
        where: { role: "admin" },
      });

      if (adminCount <= 1) {
        return withCors(
          request,
          Response.json(
            { error: "마지막 관리자 권한은 해제할 수 없습니다." },
            { status: 409 },
          ),
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, role: true },
    });

    await writeSystemLog({
      level: "warning",
      category: "permission",
      action: "role.changed",
      message: `사용자 권한을 ${role}(으)로 변경했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "user",
      targetId: user.id,
      metadata: {
        previousRole: currentUser.role,
        role,
      },
    });

    return withCors(request, Response.json({ user }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("권한 변경 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "권한을 변경하지 못했습니다.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export async function DELETE(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  try {
    const body = (await request.json()) as { userId?: unknown };
    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";

    if (!userId) {
      return withCors(
        request,
        Response.json({ error: "사용자 ID가 필요합니다." }, { status: 400 }),
      );
    }

    if (userId === authentication.user.id) {
      return withCors(
        request,
        Response.json(
          { error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다." },
          { status: 409 },
        ),
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!targetUser) {
      return withCors(
        request,
        Response.json({ error: "사용자를 찾지 못했습니다." }, { status: 404 }),
      );
    }

    if (targetUser.role === "admin") {
      const adminCount = await prisma.user.count({
        where: { role: "admin" },
      });

      if (adminCount <= 1) {
        return withCors(
          request,
          Response.json(
            { error: "마지막 관리자 계정은 삭제할 수 없습니다." },
            { status: 409 },
          ),
        );
      }
    }

    const deletedUser = await forceDeleteUser(userId);

    if (!deletedUser) {
      return withCors(
        request,
        Response.json({ error: "사용자를 찾지 못했습니다." }, { status: 404 }),
      );
    }

    await writeSystemLog({
      level: "warning",
      category: "account",
      action: "account.force.deleted",
      message: "관리자가 사용자 계정을 강제 삭제했습니다.",
      actorUserId: authentication.user.id,
      targetType: "user",
      targetId: userId,
      metadata: {
        previousRole: deletedUser.role,
        deletedJournalCount: deletedUser.deletedJournalCount,
        failedImageDeletionCount:
          deletedUser.failedImageDeletionCount,
      },
    });

    return withCors(request, Response.json({ deletedUser }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("계정 강제 삭제 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "계정을 강제 삭제하지 못했습니다.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeRole(value: unknown) {
  return value === "user" || value === "admin" ? value : undefined;
}
