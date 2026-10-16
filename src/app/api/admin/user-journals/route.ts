import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { serializeJournalImage } from "@/server/journal/imageStorage";
import type { AdminUserJournalsResponse } from "@/shared/api/admin";

export const runtime = "nodejs";

const PAGE_SIZE = 20;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const respond = (body: unknown, status = 200) => withCors(
    request,
    Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }),
  );
  if (!isRequestOriginAllowed(request)) {
    return respond({ error: "허용되지 않은 요청 출처예요." }, 403);
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) {
    authentication.response.headers.set("Cache-Control", "private, no-store");
    return withCors(request, authentication.response);
  }

  const params = new URL(request.url).searchParams;
  const userId = params.get("userId")?.trim() ?? "";
  const requestedPage = Number(params.get("page") ?? "1");
  if (!USER_ID_PATTERN.test(userId) || !Number.isSafeInteger(requestedPage) || requestedPage < 1) {
    return respond({ error: "사용자와 페이지 정보를 확인해주세요." }, 400);
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return respond({ error: "사용자를 찾지 못했습니다." }, 404);

    const total = await prisma.journalEntry.count({ where: { ownerId: userId } });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const entries = await prisma.journalEntry.findMany({
      where: { ownerId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        ownerId: true,
        title: true,
        content: true,
        image: true,
        placeName: true,
        crowd: true,
        difficulty: true,
        theme: true,
        publicationStatus: true,
        visitedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const response: AdminUserJournalsResponse = {
      entries: entries.map(({ ownerId, ...entry }) => ({
        ...entry,
        image: serializeJournalImage({ ...entry, ownerId }),
        visitedAt: entry.visitedAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
      total,
      page,
      totalPages,
    };

    // 감사 기록에 본문·사진 URL은 남기지 않는다. 기록 실패 시 내용도 반환하지 않는다.
    await writeSystemLog({
      category: "journal",
      action: "journal.admin.viewed",
      message: "관리자가 사용자의 기록을 조회했습니다.",
      actorUserId: authentication.user.id,
      targetType: "user",
      targetId: userId,
      metadata: { page, resultCount: entries.length, total, entryIds: entries.map((entry) => entry.id).join(",") },
    });

    return respond(response);
  } catch (error) {
    console.error("관리자 기록 조회에 실패했습니다.", error);
    return respond({ error: "기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." }, 500);
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
