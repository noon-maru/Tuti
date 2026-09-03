import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { forceDeleteJournalEntry } from "@/server/journal/service";
import { getJournalModerationTransition } from "@/server/journal/publicationState";
import type { AdminReportsResponse } from "@/shared/api/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 120);
  const status = normalizeReportStatus(url.searchParams.get("status"));
  const reports = await prisma.contentReport.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { targetTitle: { contains: query, mode: "insensitive" } },
              { entryId: { contains: query, mode: "insensitive" } },
              { reporterUserId: { contains: query, mode: "insensitive" } },
              { detail: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const targetEntries = await prisma.journalEntry.findMany({
    where: {
      id: {
        in: reports.flatMap((report) => report.entryId ? [report.entryId] : []),
      },
    },
    select: { id: true, publicationStatus: true },
  });
  const publicationStatusByEntryId = new Map(
    targetEntries.map((entry) => [entry.id, entry.publicationStatus]),
  );
  const response: AdminReportsResponse = {
    reports: reports.map((report) => ({
      ...report,
      targetPublicationStatus: report.entryId
        ? publicationStatusByEntryId.get(report.entryId) ?? null
        : null,
      createdAt: report.createdAt.toISOString(),
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
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
      reportId?: unknown;
      status?: unknown;
      resolutionNote?: unknown;
      moderationAction?: unknown;
    };
    const reportId =
      typeof body.reportId === "string" ? body.reportId.trim() : "";
    const status = normalizeReportStatus(body.status);
    const moderationAction = normalizeModerationAction(body.moderationAction);
    const resolutionNote =
      typeof body.resolutionNote === "string"
        ? body.resolutionNote.trim().slice(0, 1000)
        : undefined;

    if (!reportId || (!status && !moderationAction)) {
      return withCors(
        request,
        Response.json({ error: "신고 처리값을 확인해주세요." }, { status: 400 }),
      );
    }

    if (moderationAction) {
      return withCors(
        request,
        await moderateReportedJournalEntry({
          reportId,
          action: moderationAction,
          resolutionNote,
          reviewerUserId: authentication.user.id,
        }),
      );
    }

    const report = await prisma.contentReport.update({
      where: { id: reportId },
      data: {
        status: status!,
        resolutionNote,
        reviewerUserId: authentication.user.id,
        reviewedAt: status === "pending" ? null : new Date(),
      },
      select: {
        id: true,
        entryId: true,
        status: true,
      },
    });

    await writeSystemLog({
      category: "report",
      action: "report.status.updated",
      message: `신고 상태를 ${status}(으)로 변경했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "report",
      targetId: report.id,
      metadata: {
        entryId: report.entryId,
        status,
      },
    });

    return withCors(request, Response.json({ report }));
  } catch (error) {
    return adminMutationError(request, error, "신고 상태를 변경하지 못했습니다.");
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
    const body = (await request.json()) as { reportId?: unknown };
    const reportId =
      typeof body.reportId === "string" ? body.reportId.trim() : "";

    if (!reportId) {
      return withCors(
        request,
        Response.json({ error: "신고 ID가 필요합니다." }, { status: 400 }),
      );
    }

    const report = await prisma.contentReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        entryId: true,
        targetTitle: true,
      },
    });

    if (!report) {
      return withCors(
        request,
        Response.json({ error: "신고를 찾지 못했습니다." }, { status: 404 }),
      );
    }

    const deleted = report.entryId
      ? await forceDeleteJournalEntry(report.entryId)
      : false;

    await prisma.contentReport.update({
      where: { id: report.id },
      data: {
        entryId: null,
        status: "resolved",
        reviewerUserId: authentication.user.id,
        resolutionNote: deleted
          ? "관리자 강제 삭제"
          : "대상 기록이 이미 삭제됨",
        reviewedAt: new Date(),
      },
    });

    await writeSystemLog({
      level: "warning",
      category: "moderation",
      action: "journal.force.deleted",
      message: deleted
        ? `${report.targetTitle} 기록을 강제 삭제했습니다.`
        : "신고 대상 기록이 이미 삭제되어 신고만 종결했습니다.",
      actorUserId: authentication.user.id,
      targetType: "journalEntry",
      targetId: report.entryId ?? report.id,
      metadata: {
        reportId: report.id,
        deleted,
      },
    });

    return withCors(request, Response.json({ deleted, reportId }));
  } catch (error) {
    return adminMutationError(request, error, "기록을 강제 삭제하지 못했습니다.");
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeReportStatus(value: unknown) {
  return value === "pending" ||
    value === "reviewing" ||
    value === "resolved" ||
    value === "dismissed"
    ? value
    : undefined;
}

function normalizeModerationAction(value: unknown) {
  return value === "hide" || value === "restore" ? value : undefined;
}

async function moderateReportedJournalEntry({
  reportId,
  action,
  resolutionNote,
  reviewerUserId,
}: {
  reportId: string;
  action: "hide" | "restore";
  resolutionNote?: string;
  reviewerUserId: string;
}) {
  const report = await prisma.contentReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      entryId: true,
      targetTitle: true,
    },
  });

  if (!report?.entryId) {
    return Response.json(
      { error: "조치할 신고 대상 기록이 없습니다." },
      { status: 409 },
    );
  }

  const entry = await prisma.journalEntry.findUnique({
    where: { id: report.entryId },
    select: { publicationStatus: true },
  });
  const transition = entry
    ? getJournalModerationTransition(entry.publicationStatus, action)
    : null;

  if (!transition) {
    return Response.json(
      {
        error:
          action === "hide"
            ? "현재 공개 중인 기록만 숨길 수 있습니다."
            : "관리자가 숨긴 기록만 복원할 수 있습니다.",
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const defaultNote = action === "hide" ? "관리자 즉시 숨김" : "관리자 공개 복원";
  const note = resolutionNote || defaultNote;

  const result = await prisma.$transaction(async (transaction) => {
    const updatedEntry = await transaction.journalEntry.updateMany({
      where: {
        id: report.entryId!,
        publicationStatus: transition.expectedStatus,
        publicId: { not: null },
        publishedAt: { not: null },
      },
      data: {
        publicationStatus: transition.nextStatus,
        publicationStatusChangedAt: now,
      },
    });

    if (updatedEntry.count === 0) return null;

    await transaction.contentReport.updateMany({
      where: {
        entryId: report.entryId,
        status: { in: ["pending", "reviewing"] },
      },
      data: {
        status: "resolved",
        resolutionNote: note,
        reviewerUserId,
        reviewedAt: now,
      },
    });

    return transaction.contentReport.update({
      where: { id: report.id },
      data: {
        status: "resolved",
        resolutionNote: note,
        reviewerUserId,
        reviewedAt: now,
      },
      select: { id: true, entryId: true, status: true },
    });
  });

  if (!result) {
    return Response.json(
      {
        error:
          action === "hide"
            ? "현재 공개 중인 기록만 숨길 수 있습니다."
            : "관리자가 숨긴 기록만 복원할 수 있습니다.",
      },
      { status: 409 },
    );
  }

  await writeSystemLog({
    level: action === "hide" ? "warning" : "info",
    category: "moderation",
    action: action === "hide" ? "journal.hidden" : "journal.restored",
    message:
      action === "hide"
        ? `${report.targetTitle} 기록을 공개 화면에서 숨겼습니다.`
        : `${report.targetTitle} 기록의 공개를 복원했습니다.`,
    actorUserId: reviewerUserId,
    targetType: "journalEntry",
    targetId: report.entryId,
    metadata: { reportId: report.id, resolutionNote: note },
  });

  return Response.json({
    report: result,
    publicationStatus: transition.nextStatus,
  });
}

function adminMutationError(
  request: Request,
  error: unknown,
  fallback: string,
) {
  const invalidJson = error instanceof SyntaxError;

  if (!invalidJson) {
    console.error(fallback, error);
  }

  return withCors(
    request,
    Response.json(
      { error: invalidJson ? "요청 본문을 확인해주세요." : fallback },
      { status: invalidJson ? 400 : 500 },
    ),
  );
}
