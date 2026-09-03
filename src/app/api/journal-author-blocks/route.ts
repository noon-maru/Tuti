import { writeSystemLogSafely } from "@/server/admin/log";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { JournalAuthorBlocksResponse } from "@/shared/api/journal";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authentication = await authenticate(request);
  if (authentication instanceof Response) return authentication;

  const blocks = await prisma.journalAuthorBlock.findMany({
    where: { blockerUserId: authentication.id },
    orderBy: { createdAt: "desc" },
  });
  const response: JournalAuthorBlocksResponse = {
    blocks: blocks.map((block) => ({
      blockedUserId: block.blockedUserId,
      createdAt: block.createdAt.toISOString(),
    })),
  };
  return withCors(request, Response.json(response));
}

export async function POST(request: Request) {
  const authentication = await authenticate(request);
  if (authentication instanceof Response) return authentication;

  try {
    const body = (await request.json()) as { publicId?: unknown };
    const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";
    const entry = await prisma.journalEntry.findFirst({
      where: { publicId, publicationStatus: "published", publishedAt: { not: null } },
      select: { ownerId: true },
    });
    if (!entry || entry.ownerId === authentication.id) {
      return withCors(request, Response.json({ error: "차단할 작성자를 찾지 못했어요." }, { status: 404 }));
    }

    await prisma.journalAuthorBlock.upsert({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId: authentication.id,
          blockedUserId: entry.ownerId,
        },
      },
      create: { blockerUserId: authentication.id, blockedUserId: entry.ownerId },
      update: {},
    });
    await writeSystemLogSafely({
      category: "moderation",
      action: "journal.author.blocked",
      message: "사용자가 공개 기록 작성자를 차단했습니다.",
      actorUserId: authentication.id,
      targetType: "user",
      targetId: entry.ownerId,
    });
    return withCors(request, Response.json({ blocked: true }));
  } catch (error) {
    return mutationError(request, error, "작성자를 차단하지 못했어요.");
  }
}

export async function DELETE(request: Request) {
  const authentication = await authenticate(request);
  if (authentication instanceof Response) return authentication;

  try {
    const body = (await request.json()) as { blockedUserId?: unknown };
    const blockedUserId = typeof body.blockedUserId === "string"
      ? body.blockedUserId.trim()
      : "";
    if (!blockedUserId) {
      return withCors(request, Response.json({ error: "차단 해제 대상을 확인해주세요." }, { status: 400 }));
    }
    const result = await prisma.journalAuthorBlock.deleteMany({
      where: { blockerUserId: authentication.id, blockedUserId },
    });
    if (result.count === 0) {
      return withCors(request, Response.json({ error: "차단 기록을 찾지 못했어요." }, { status: 404 }));
    }
    await writeSystemLogSafely({
      category: "moderation",
      action: "journal.author.unblocked",
      message: "사용자가 공개 기록 작성자 차단을 해제했습니다.",
      actorUserId: authentication.id,
      targetType: "user",
      targetId: blockedUserId,
    });
    return withCors(request, Response.json({ blocked: false }));
  } catch (error) {
    return mutationError(request, error, "작성자 차단을 해제하지 못했어요.");
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

async function authenticate(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const user = await authenticateUser(request);
  return user ?? withCors(request, Response.json({ error: "사용자 세션이 필요해요." }, { status: 401 }));
}

function mutationError(request: Request, error: unknown, message: string) {
  const invalidJson = error instanceof SyntaxError;
  if (!invalidJson) console.error(message, error);
  return withCors(
    request,
    Response.json({ error: invalidJson ? "요청 본문을 확인해주세요." : message }, { status: invalidJson ? 400 : 500 }),
  );
}
