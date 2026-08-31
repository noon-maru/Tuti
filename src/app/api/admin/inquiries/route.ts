import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminInquiriesResponse } from "@/shared/api/admin";
import { sendPushToUserSafely } from "@/server/notifications/fcm";

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
  const status = normalizeInquiryStatus(url.searchParams.get("status"));
  const inquiries = await prisma.customerInquiry.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { subject: { contains: query, mode: "insensitive" } },
              { message: { contains: query, mode: "insensitive" } },
              { requesterEmail: { contains: query, mode: "insensitive" } },
              { requesterUserId: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const response: AdminInquiriesResponse = {
    inquiries: inquiries.map((inquiry) => ({
      ...inquiry,
      handledAt: inquiry.handledAt?.toISOString() ?? null,
      createdAt: inquiry.createdAt.toISOString(),
      updatedAt: inquiry.updatedAt.toISOString(),
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
      inquiryId?: unknown;
      status?: unknown;
      adminResponse?: unknown;
    };
    const inquiryId =
      typeof body.inquiryId === "string" ? body.inquiryId.trim() : "";
    const status = normalizeInquiryStatus(body.status);
    const adminResponse =
      typeof body.adminResponse === "string"
        ? body.adminResponse.trim().slice(0, 4000)
        : undefined;

    if (!inquiryId || !status) {
      return withCors(
        request,
        Response.json({ error: "문의 처리값을 확인해주세요." }, { status: 400 }),
      );
    }

    const previousInquiry = await prisma.customerInquiry.findUnique({
      where: { id: inquiryId },
      select: { adminResponse: true, status: true },
    });
    if (!previousInquiry) {
      return withCors(
        request,
        Response.json({ error: "문의를 찾지 못했습니다." }, { status: 404 }),
      );
    }

    const inquiry = await prisma.customerInquiry.update({
      where: { id: inquiryId },
      data: {
        status,
        ...(adminResponse !== undefined ? { adminResponse } : {}),
        handledByUserId: authentication.user.id,
        handledAt: status === "pending" ? null : new Date(),
      },
      select: {
        id: true,
        status: true,
        requesterUserId: true,
        subject: true,
      },
    });

    await writeSystemLog({
      category: "inquiry",
      action: "inquiry.updated",
      message: `1:1 문의 상태를 ${status}(으)로 변경했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "inquiry",
      targetId: inquiry.id,
      metadata: {
        status,
        hasResponse: Boolean(adminResponse),
      },
    });

    const responseChanged =
      Boolean(adminResponse) && adminResponse !== previousInquiry.adminResponse;
    const becameAnswered =
      status === "answered" && previousInquiry.status !== "answered";
    if (responseChanged || becameAnswered) {
      await sendPushToUserSafely(inquiry.requesterUserId, {
        title: "문의에 답변이 도착했어요",
        body: inquiry.subject,
        type: "inquiry-answered",
        path: "/inquiry?view=history",
        entityId: inquiry.id,
      });
    }

    return withCors(request, Response.json({ inquiry }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("1:1 문의 처리 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "문의를 처리하지 못했습니다.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeInquiryStatus(value: unknown) {
  return value === "pending" ||
    value === "reviewing" ||
    value === "answered" ||
    value === "closed"
    ? value
    : undefined;
}
