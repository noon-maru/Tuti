import { randomUUID } from "node:crypto";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { isFcmPushEnabledForUser } from "@/server/notifications/fcm";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  pushPlatforms,
  type PushDeviceResponse,
  type RegisterPushDeviceRequest,
  type UnregisterPushDeviceRequest,
} from "@/shared/api/push";

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

    if (!(await isFcmPushEnabledForUser(user.id))) {
      return withCors(
        request,
        Response.json(
          { error: "문의 답변 알림은 10월 1일부터 사용할 수 있어요." },
          { status: 503 },
        ),
      );
    }

    const input = parseRegistration(
      (await request.json()) as RegisterPushDeviceRequest,
    );
    const now = new Date();

    await prisma.$transaction(async (transaction) => {
      await transaction.pushDevice.deleteMany({
        where: {
          token: input.token,
          installationId: { not: input.installationId },
        },
      });
      await transaction.pushDevice.upsert({
        where: { installationId: input.installationId },
        update: {
          userId: user.id,
          platform: input.platform,
          token: input.token,
          enabled: true,
          appVersion: input.appVersion,
          locale: input.locale,
          lastSeenAt: now,
          invalidatedAt: null,
        },
        create: {
          id: randomUUID(),
          userId: user.id,
          installationId: input.installationId,
          platform: input.platform,
          token: input.token,
          appVersion: input.appVersion,
          locale: input.locale,
          lastSeenAt: now,
        },
      });
    });

    const response: PushDeviceResponse = { registered: true };
    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidInput = error instanceof PushDeviceInputError ? error : null;
    if (!invalidInput) {
      console.error("푸시 기기를 등록하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        { error: invalidInput?.message ?? "푸시 기기를 등록하지 못했어요." },
        { status: invalidInput ? 400 : 500 },
      ),
    );
  }
}

export async function DELETE(request: Request) {
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

    const input = (await request.json()) as UnregisterPushDeviceRequest;
    const installationId = normalizeInstallationId(input.installationId);
    await prisma.pushDevice.deleteMany({
      where: { installationId, userId: user.id },
    });

    return withCors(request, new Response(null, { status: 204 }));
  } catch (error) {
    const invalidInput = error instanceof PushDeviceInputError ? error : null;
    if (!invalidInput) {
      console.error("푸시 기기 등록을 해제하지 못했습니다.", error);
    }
    return withCors(
      request,
      Response.json(
        { error: invalidInput?.message ?? "푸시 기기 등록을 해제하지 못했어요." },
        { status: invalidInput ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function parseRegistration(input: RegisterPushDeviceRequest) {
  const installationId = normalizeInstallationId(input?.installationId);
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  const platform = pushPlatforms.includes(input?.platform)
    ? input.platform
    : null;
  const appVersion = normalizeOptional(input?.appVersion, 40);
  const locale = normalizeOptional(input?.locale, 32);

  if (!platform || token.length < 16 || token.length > 4096) {
    throw new PushDeviceInputError("푸시 기기 정보를 확인해주세요.");
  }

  return { installationId, platform, token, appVersion, locale };
}

function normalizeInstallationId(value: unknown) {
  const installationId = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(installationId)) {
    throw new PushDeviceInputError("앱 설치 식별자를 확인해주세요.");
  }
  return installationId;
}

function normalizeOptional(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

class PushDeviceInputError extends Error {}
