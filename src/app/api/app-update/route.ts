import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  createAppUpdatePolicy,
  InvalidAppUpdateConfigurationError,
  InvalidAppVersionError,
} from "@/server/appUpdate/appUpdatePolicy";
import type { NativeAppPlatform } from "@/shared/api/appUpdate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const platform = normalizePlatform(searchParams.get("platform"));
  const currentVersion = searchParams.get("version")?.trim() ?? "";

  if (!platform) {
    return withCors(
      request,
      Response.json({ error: "앱 플랫폼을 확인해주세요." }, { status: 400 }),
    );
  }

  try {
    return withCors(
      request,
      Response.json(createAppUpdatePolicy(platform, currentVersion), {
        headers: { "Cache-Control": "no-store, max-age=0" },
      }),
    );
  } catch (error) {
    if (error instanceof InvalidAppVersionError) {
      return withCors(
        request,
        Response.json({ error: error.message }, { status: 400 }),
      );
    }

    if (error instanceof InvalidAppUpdateConfigurationError) {
      console.error(error.message);
      return withCors(
        request,
        Response.json(
          { error: "앱 업데이트 정보를 불러오지 못했어요." },
          { status: 503 },
        ),
      );
    }

    throw error;
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizePlatform(value: string | null): NativeAppPlatform | null {
  return value === "android" || value === "ios" ? value : null;
}
