import { randomUUID } from "node:crypto";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { isPushEnabledForUser } from "@/server/notifications/pushAccess";
import { webPushConfiguration, webPushInstallationId } from "@/server/notifications/webPush";
import { parseWebPushSubscription } from "@/shared/notifications/webPush";
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

    const input = parseRegistration(
      (await request.json()) as RegisterPushDeviceRequest,
    );

    if (!(await isPushEnabledForUser(user.id, input.platform)) || (input.platform === "web" && !webPushConfiguration())) {
      return withCors(
        request,
        Response.json(
          { error: "현재 서버 알림을 사용할 수 없어요. 잠시 후 다시 시도해주세요." },
          { status: 503 },
        ),
      );
    }

    const now = new Date();

    await prisma.$transaction(async (transaction) => {
      if (input.platform === "web") {
        await transaction.$queryRaw`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`;
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.installationId},0))::text`;
        const existing = await transaction.pushDevice.findUnique({ where: { installationId: input.installationId }, select: { userId: true } });
        if (existing && existing.userId !== user.id) throw new PushDeviceInputError("이 브라우저의 이전 알림을 해제한 뒤 다시 켜주세요.");
        if (!existing && await transaction.pushDevice.count({ where: { userId: user.id, platform: "web" } }) >= 20) throw new PushDeviceInputError("등록된 브라우저가 많아요. 사용하지 않는 브라우저의 알림을 먼저 해제해주세요.");
      } else await transaction.pushDevice.deleteMany({
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
      console.error("푸시 기기를 등록하지 못했습니다.", { error: error instanceof Error ? error.name : "UnknownError" });
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
    const installationId = normalizeInstallationId(input?.installationId);
    const subscription = input.webSubscription === undefined ? null : parseWebPushSubscription(input.webSubscription);
    if (input.webSubscription !== undefined && (!subscription || webPushInstallationId(subscription.endpoint) !== installationId)) throw new PushDeviceInputError("브라우저 알림 해제 정보를 확인해주세요.");
    await prisma.pushDevice.deleteMany({
      // 계정 전환 뒤에도 브라우저가 가진 구독 전체(비밀 auth 포함)로 자신의 구독만 철회한다.
      // 다른 계정 기기 목록 조회·등록 이전이나 네이티브 토큰 삭제를 허용하지 않는다.
      where: subscription ? { installationId, platform: "web", token: JSON.stringify(subscription) } : { installationId, userId: user.id },
    });

    return withCors(request, new Response(null, { status: 204 }));
  } catch (error) {
    const invalidInput = error instanceof PushDeviceInputError ? error : null;
    if (!invalidInput) {
      console.error("푸시 기기 등록을 해제하지 못했습니다.", { error: error instanceof Error ? error.name : "UnknownError" });
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
  let installationId = normalizeInstallationId(input?.installationId);
  let token = typeof input?.token === "string" ? input.token.trim() : "";
  const platform = pushPlatforms.includes(input?.platform)
    ? input.platform
    : null;
  const appVersion = normalizeOptional(input?.appVersion, 40);
  const locale = normalizeOptional(input?.locale, 32);

  if (!platform || token.length < 16 || token.length > 4096) {
    throw new PushDeviceInputError("푸시 기기 정보를 확인해주세요.");
  }
  if (platform !== "web" && installationId.startsWith("web_")) throw new PushDeviceInputError("웹 구독 식별자는 브라우저 등록에서만 사용할 수 있어요.");
  if (platform === "web") {
    let subscription;
    try { subscription = parseWebPushSubscription(JSON.parse(token)); } catch { /* 아래에서 동일한 입력 오류로 처리한다. */ }
    if (!subscription) throw new PushDeviceInputError("브라우저 알림 구독 정보를 확인해주세요.");
    token = JSON.stringify(subscription);
    installationId = webPushInstallationId(subscription.endpoint);
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
