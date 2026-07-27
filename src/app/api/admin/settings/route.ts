import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import {
  getAdminSettings,
  isAdminSettingKey,
} from "@/server/admin/settings";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminSettingsResponse } from "@/shared/api/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const response: AdminSettingsResponse = {
    settings: await getAdminSettings(),
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
      key?: unknown;
      value?: unknown;
    };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const value =
      typeof body.value === "string" ? body.value.trim().slice(0, 2000) : "";

    if (!isAdminSettingKey(key) || !isValidSettingValue(key, value)) {
      return withCors(
        request,
        Response.json({ error: "설정값을 확인해주세요." }, { status: 400 }),
      );
    }

    const setting = await prisma.appSetting.upsert({
      where: { key },
      create: {
        key,
        value,
        updatedByUserId: authentication.user.id,
      },
      update: {
        value,
        updatedByUserId: authentication.user.id,
      },
    });

    await writeSystemLog({
      category: "setting",
      action: "setting.updated",
      message: `${key} 설정을 변경했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "setting",
      targetId: key,
      metadata: { value },
    });

    return withCors(
      request,
      Response.json({
        setting: {
          ...setting,
          updatedAt: setting.updatedAt.toISOString(),
        },
      }),
    );
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("설정 변경 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "설정을 변경하지 못했습니다.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function isValidSettingValue(key: string, value: string) {
  if (
    key === "places.publicDataAutoApprove" ||
    key === "reports.intakeEnabled"
  ) {
    return value === "true" || value === "false";
  }

  return key === "service.maintenanceNotice";
}
