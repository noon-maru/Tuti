import { randomUUID } from "node:crypto";
import { writeSystemLogSafely } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUEST_SUBJECT = "Tuti 계정 및 관련 데이터 삭제 요청";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const input = (await request.json()) as {
      email?: unknown;
      details?: unknown;
      confirmed?: unknown;
    };
    const email = typeof input.email === "string"
      ? input.email.trim().toLowerCase().slice(0, 254)
      : "";
    const details = typeof input.details === "string"
      ? input.details.trim().slice(0, 1000)
      : "";

    if (!EMAIL_PATTERN.test(email)) {
      return withCors(
        request,
        Response.json(
          { error: "회신받을 이메일을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    if (input.confirmed !== true) {
      return withCors(
        request,
        Response.json(
          { error: "삭제 후 복구할 수 없다는 내용을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const existingRequest = await prisma.customerInquiry.findFirst({
      where: {
        requesterEmail: email,
        subject: REQUEST_SUBJECT,
        status: { in: ["pending", "reviewing"] },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (existingRequest) {
      return withCors(
        request,
        Response.json({
          request: {
            id: existingRequest.id,
            createdAt: existingRequest.createdAt.toISOString(),
          },
        }),
      );
    }

    const deletionRequest = await prisma.customerInquiry.create({
      data: {
        id: randomUUID(),
        requesterEmail: email,
        category: "privacy",
        subject: REQUEST_SUBJECT,
        message: details || "계정과 관련 데이터 전체의 삭제를 요청합니다.",
      },
      select: { id: true, createdAt: true },
    });

    await writeSystemLogSafely({
      category: "account",
      action: "account.deletion.requested",
      message: "공개 페이지에서 계정 및 관련 데이터 삭제 요청이 접수되었습니다.",
      targetType: "customer_inquiry",
      targetId: deletionRequest.id,
      metadata: { source: "public_account_deletion_page" },
    });

    return withCors(
      request,
      Response.json(
        {
          request: {
            id: deletionRequest.id,
            createdAt: deletionRequest.createdAt.toISOString(),
          },
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("계정 삭제 요청을 접수하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 내용을 확인해주세요."
            : "계정 삭제 요청을 접수하지 못했어요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
