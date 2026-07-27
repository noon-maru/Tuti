import { randomUUID } from "node:crypto";
import { writeSystemLog } from "@/server/admin/log";
import { isSettingEnabled } from "@/server/admin/settings";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const user = await authenticateUser(request);

    if (!user) {
      return withCors(
        request,
        Response.json({ error: "사용자 인증이 필요합니다." }, { status: 401 }),
      );
    }

    if (!(await isSettingEnabled("reports.intakeEnabled"))) {
      return withCors(
        request,
        Response.json(
          { error: "현재 신고 접수를 잠시 중단했습니다." },
          { status: 503 },
        ),
      );
    }

    const body = (await request.json()) as {
      entryId?: unknown;
      publicId?: unknown;
      reason?: unknown;
      detail?: unknown;
    };
    const entryId =
      typeof body.entryId === "string" ? body.entryId.trim() : undefined;
    const publicId =
      typeof body.publicId === "string" ? body.publicId.trim() : undefined;
    const reason = normalizeReportReason(body.reason);
    const detail =
      typeof body.detail === "string"
        ? body.detail.trim().slice(0, 1000)
        : undefined;

    if ((!entryId && !publicId) || !reason) {
      return withCors(
        request,
        Response.json({ error: "신고 내용을 확인해주세요." }, { status: 400 }),
      );
    }

    const entry = await prisma.journalEntry.findFirst({
      where: entryId ? { id: entryId } : { publicId },
      select: {
        id: true,
        ownerId: true,
        title: true,
        placeName: true,
        publicId: true,
      },
    });

    if (!entry || entry.ownerId === user.id) {
      return withCors(
        request,
        Response.json(
          { error: "신고할 공개 기록을 찾지 못했습니다." },
          { status: 404 },
        ),
      );
    }

    const existingReport = await prisma.contentReport.findFirst({
      where: {
        reporterUserId: user.id,
        entryId: entry.id,
        status: { in: ["pending", "reviewing"] },
      },
      select: { id: true },
    });

    if (existingReport) {
      return withCors(
        request,
        Response.json(
          { error: "이미 확인 중인 신고가 있습니다." },
          { status: 409 },
        ),
      );
    }

    const report = await prisma.contentReport.create({
      data: {
        id: randomUUID(),
        reporterUserId: user.id,
        entryId: entry.id,
        targetOwnerId: entry.ownerId,
        targetTitle: entry.title || entry.placeName,
        targetPublicId: entry.publicId,
        reason,
        detail,
      },
      select: { id: true, status: true },
    });

    await writeSystemLog({
      category: "report",
      action: "report.created",
      message: "새 콘텐츠 신고가 접수되었습니다.",
      actorUserId: user.id,
      targetType: "journalEntry",
      targetId: entry.id,
      metadata: {
        reportId: report.id,
        reason,
      },
    });

    return withCors(
      request,
      Response.json({ report }, { status: 201 }),
    );
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("신고 접수 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "신고를 접수하지 못했습니다.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeReportReason(value: unknown) {
  return value === "inappropriate" ||
    value === "copyright" ||
    value === "privacy" ||
    value === "spam" ||
    value === "other"
    ? value
    : undefined;
}
