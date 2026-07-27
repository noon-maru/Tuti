import { randomUUID } from "node:crypto";
import { writeSystemLogSafely } from "@/server/admin/log";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  CreateInquiryRequest,
  CreateInquiryResponse,
  InquiryCategory,
  UserInquiriesResponse,
} from "@/shared/api/inquiry";
import { inquiryCategories } from "@/shared/api/inquiry";

export const runtime = "nodejs";

const MAX_INQUIRIES_PER_DAY = 5;

export async function GET(request: Request) {
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

    const inquiries = await prisma.customerInquiry.findMany({
      where: { requesterUserId: user.id },
      select: {
        id: true,
        category: true,
        subject: true,
        message: true,
        status: true,
        adminResponse: true,
        handledAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const response: UserInquiriesResponse = {
      inquiries: inquiries.map((inquiry) => ({
        ...inquiry,
        handledAt: inquiry.handledAt?.toISOString() ?? null,
        createdAt: inquiry.createdAt.toISOString(),
        updatedAt: inquiry.updatedAt.toISOString(),
      })),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("1:1 문의 조회 중 오류가 발생했습니다.", error);
    return withCors(
      request,
      Response.json(
        { error: "문의 내역을 불러오지 못했습니다." },
        { status: 500 },
      ),
    );
  }
}

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

    const input = parseInquiryInput(
      (await request.json()) as CreateInquiryRequest,
    );
    const since = new Date();
    since.setDate(since.getDate() - 1);
    const recentCount = await prisma.customerInquiry.count({
      where: {
        requesterUserId: user.id,
        createdAt: { gte: since },
      },
    });

    if (recentCount >= MAX_INQUIRIES_PER_DAY) {
      return withCors(
        request,
        Response.json(
          { error: "문의는 하루에 최대 5번까지 접수할 수 있어요." },
          { status: 429 },
        ),
      );
    }

    const inquiry = await prisma.customerInquiry.create({
      data: {
        id: randomUUID(),
        requesterUserId: user.id,
        requesterEmail: input.email ?? user.account?.email,
        category: input.category,
        subject: input.subject,
        message: input.message,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    await writeSystemLogSafely({
      category: "inquiry",
      action: "inquiry.created",
      message: "새 1:1 문의가 접수되었습니다.",
      actorUserId: user.id,
      targetType: "inquiry",
      targetId: inquiry.id,
      metadata: {
        category: input.category,
      },
    });

    const response: CreateInquiryResponse = {
      inquiry: {
        id: inquiry.id,
        status: "pending",
        createdAt: inquiry.createdAt.toISOString(),
      },
    };

    return withCors(
      request,
      Response.json(response, { status: 201 }),
    );
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    const invalidInput =
      error instanceof InquiryInputError ? error : null;

    if (!invalidJson && !invalidInput) {
      console.error("1:1 문의 접수 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidInput?.message ??
            (invalidJson
              ? "요청 본문을 확인해주세요."
              : "문의를 접수하지 못했습니다."),
        },
        { status: invalidJson || invalidInput ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function parseInquiryInput(input: CreateInquiryRequest) {
  const category = inquiryCategories.includes(input?.category)
    ? input.category
    : null;
  const subject =
    typeof input?.subject === "string" ? input.subject.trim() : "";
  const message =
    typeof input?.message === "string" ? input.message.trim() : "";
  const email =
    typeof input?.email === "string"
      ? input.email.trim().toLowerCase()
      : "";

  if (!category) {
    throw new InquiryInputError("문의 유형을 선택해주세요.");
  }

  if (subject.length < 2 || subject.length > 120) {
    throw new InquiryInputError("문의 제목은 2~120자로 입력해주세요.");
  }

  if (message.length < 10 || message.length > 4000) {
    throw new InquiryInputError("문의 내용은 10~4,000자로 입력해주세요.");
  }

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new InquiryInputError("답변받을 이메일 형식을 확인해주세요.");
  }

  return {
    category: category as InquiryCategory,
    subject,
    message,
    email: email || undefined,
  };
}

class InquiryInputError extends Error {}
