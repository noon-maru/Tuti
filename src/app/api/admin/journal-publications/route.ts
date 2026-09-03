import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import { serializeJournalImage } from "@/server/journal/imageStorage";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminJournalPublicationReviewsResponse } from "@/shared/api/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  const entries = await prisma.journalEntry.findMany({
    where: { publicationStatus: "pending" },
    orderBy: { publicationStatusChangedAt: "asc" },
    take: 100,
    select: {
      id: true,
      ownerId: true,
      title: true,
      content: true,
      image: true,
      placeName: true,
      updatedAt: true,
      publicationReviewReasons: true,
      publicationStatusChangedAt: true,
    },
  });
  const response: AdminJournalPublicationReviewsResponse = {
    reviews: entries.map((entry) => ({
      id: entry.id,
      ownerId: entry.ownerId,
      title: entry.title,
      content: entry.content,
      image: serializeJournalImage(entry),
      placeName: entry.placeName,
      reasons: normalizeReasons(entry.publicationReviewReasons),
      requestedAt: entry.publicationStatusChangedAt.toISOString(),
    })),
  };

  return withCors(request, Response.json(response));
}

export async function PATCH(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  try {
    const body = (await request.json()) as {
      entryId?: unknown;
      action?: unknown;
      note?: unknown;
    };
    const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
    const action = body.action === "approve" || body.action === "reject"
      ? body.action
      : null;
    const note = typeof body.note === "string"
      ? body.note.trim().slice(0, 1000)
      : "";

    if (!entryId || !action) {
      return withCors(
        request,
        Response.json({ error: "공개 검토값을 확인해주세요." }, { status: 400 }),
      );
    }

    const now = new Date();
    const result = await prisma.journalEntry.updateMany({
      where: { id: entryId, publicationStatus: "pending", publicId: { not: null } },
      data: {
        publicationStatus: action === "approve" ? "published" : "hidden",
        publishedAt: action === "approve" ? now : null,
        publicationStatusChangedAt: now,
        publicationReviewedAt: now,
        publicationReviewerUserId: authentication.user.id,
      },
    });

    if (result.count === 0) {
      return withCors(
        request,
        Response.json({ error: "검토 대기 중인 기록을 찾지 못했습니다." }, { status: 409 }),
      );
    }

    await writeSystemLog({
      level: action === "approve" ? "info" : "warning",
      category: "moderation",
      action: action === "approve"
        ? "journal.publication.approved"
        : "journal.publication.rejected",
      message: action === "approve"
        ? "기록의 인터넷 공개를 승인했습니다."
        : "기록의 인터넷 공개를 거절했습니다.",
      actorUserId: authentication.user.id,
      targetType: "journalEntry",
      targetId: entryId,
      metadata: { note: note || null },
    });

    return withCors(request, Response.json({ entryId, action }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    if (!invalidJson) console.error("기록 공개 검토에 실패했습니다.", error);
    return withCors(
      request,
      Response.json(
        { error: invalidJson ? "요청 본문을 확인해주세요." : "기록 공개 검토에 실패했습니다." },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeReasons(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
