import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  isStoredJournalImage,
  serializeJournalImage,
} from "@/server/journal/imageStorage";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminJournalPublicationReviewsResponse } from "@/shared/api/admin";
import { JOURNAL_PUBLICATION_POLICY_VERSION } from "@/shared/legal/journalPublicationPolicy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  const entries = await prisma.journalEntry.findMany({
    where: { publicationStatus: { in: ["pending", "hidden"] } },
    orderBy: { publicationStatusChangedAt: "asc" },
    take: 200,
    select: {
      id: true,
      ownerId: true,
      owner: {
        select: { journalPublicationRestrictedAt: true },
      },
      title: true,
      content: true,
      image: true,
      placeName: true,
      updatedAt: true,
      publicationReviewReasons: true,
      publicationStatus: true,
      publicationStatusChangedAt: true,
    },
  });
  const reportedEntryIds = new Set(
    (
      await prisma.contentReport.findMany({
        where: {
          entryId: {
            in: entries
              .filter((entry) => entry.publicationStatus === "hidden")
              .map((entry) => entry.id),
          },
        },
        distinct: ["entryId"],
        select: { entryId: true },
      })
    ).flatMap((report) => (report.entryId ? [report.entryId] : [])),
  );
  const reviews = entries
    .filter(
      (entry) =>
        !entry.owner.journalPublicationRestrictedAt &&
        (entry.publicationStatus === "pending" ||
          !reportedEntryIds.has(entry.id)),
    )
    .slice(0, 100);
  const response: AdminJournalPublicationReviewsResponse = {
    reviews: reviews.map((entry) => ({
      id: entry.id,
      ownerId: entry.ownerId,
      title: entry.title,
      content: entry.content,
      image:
        entry.image && isStoredJournalImage(entry.image)
          ? serializeJournalImage(entry)
          : null,
      placeName: entry.placeName,
      reasons: normalizeReasons(entry.publicationReviewReasons),
      status:
        entry.publicationStatus === "pending" ? "pending" : "hidden",
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
    const action = body.action === "approve" ||
      body.action === "reject" ||
      body.action === "restore"
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

    if (
      action === "restore" &&
      await prisma.contentReport.findFirst({
        where: { entryId },
        select: { id: true },
      })
    ) {
      return withCors(
        request,
        Response.json(
          { error: "신고로 숨긴 기록은 신고 관리에서 복원해주세요." },
          { status: 409 },
        ),
      );
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.journalEntry.updateMany({
        where: {
          id: entryId,
          publicationStatus: action === "restore" ? "hidden" : "pending",
          publicId: { not: null },
          owner: { journalPublicationRestrictedAt: null },
          ...(action === "reject"
            ? {}
            : {
                publicationConsentVersion:
                  JOURNAL_PUBLICATION_POLICY_VERSION,
                publicationConsentedAt: { not: null },
              }),
        },
        data: {
          publicationStatus: action === "reject" ? "hidden" : "published",
          publishedAt: action === "reject" ? null : now,
          publicationStatusChangedAt: now,
          publicationReviewedAt: now,
          publicationReviewerUserId: authentication.user.id,
        },
      });
      if (result.count === 0) return false;

      await writeSystemLog(
        {
          level: action === "reject" ? "warning" : "info",
          category: "moderation",
          action: action === "approve"
            ? "journal.publication.approved"
            : action === "restore"
              ? "journal.publication.restored"
              : "journal.publication.rejected",
          message: action === "approve"
            ? "기록의 인터넷 공개를 승인했습니다."
            : action === "restore"
              ? "공개 거절 기록을 재검토하여 복원했습니다."
              : "기록의 인터넷 공개를 거절했습니다.",
          actorUserId: authentication.user.id,
          targetType: "journalEntry",
          targetId: entryId,
          metadata: { note: note || null },
        },
        transaction,
      );
      return true;
    });

    if (!updated) {
      return withCors(
        request,
        Response.json(
          {
            error: action === "restore"
              ? "복원할 공개 거절 기록을 찾지 못했습니다."
              : "검토 대기 중인 기록을 찾지 못했습니다.",
          },
          { status: 409 },
        ),
      );
    }

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
