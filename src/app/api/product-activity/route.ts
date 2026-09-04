import { randomUUID } from "node:crypto";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  normalizeProductActivityInput,
  type ProductActivityResponse,
} from "@/shared/api/productActivity";

export const runtime = "nodejs";

const ACTIVITY_RETENTION_DAYS = 180;

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const user = await authenticateUser(request);
    if (!user) {
      return withCors(
        request,
        Response.json({ error: "사용자 확인이 필요해요." }, { status: 401 }),
      );
    }

    const input = normalizeProductActivityInput(await request.json());
    if (!input) {
      return withCors(
        request,
        Response.json(
          { error: "활동 기록 요청을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const retentionUntil = new Date();
    retentionUntil.setUTCDate(
      retentionUntil.getUTCDate() + ACTIVITY_RETENTION_DAYS,
    );

    await prisma.productActivityEvent.upsert({
      where: {
        userId_clientSessionId_action: {
          userId: user.id,
          clientSessionId: input.clientSessionId,
          action: input.action,
        },
      },
      create: {
        id: randomUUID(),
        userId: user.id,
        clientSessionId: input.clientSessionId,
        action: input.action,
        platform: input.platform,
        appVersion: input.appVersion,
        retentionUntil,
      },
      update: {},
    });

    const response: ProductActivityResponse = { recorded: true };
    return withCors(request, Response.json(response, { status: 201 }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    if (!invalidJson) {
      console.error("제품 활동을 기록하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "활동을 기록하지 못했어요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
