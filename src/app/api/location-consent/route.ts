import { authenticateUser } from "@/server/auth/session";
import {
  getCurrentLocationConsent,
  LocationComplianceError,
  recordLocationConsent,
} from "@/server/location/compliance";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  LocationConsentResponse,
  LocationConsentUpdate,
} from "@/shared/api/locationCompliance";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import type { LocationConsentStatus } from "@/shared/tuti/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const user = await authenticateUser(request);
  if (!user) {
    return withCors(
      request,
      Response.json(
        { error: "사용자 세션을 확인해주세요.", code: "location_auth_required" },
        { status: 401 },
      ),
    );
  }

  const consent = await getCurrentLocationConsent(user.id);
  const response: LocationConsentResponse = {
    consent: consent
      ? {
          status: consent.status,
          termsVersion: consent.termsVersion,
          ageConfirmed: consent.ageConfirmed,
          updatedAt: consent.createdAt.toISOString(),
        }
      : null,
  };
  return withCors(request, Response.json(response));
}

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const user = await authenticateUser(request);
    if (!user) {
      throw new LocationComplianceError(
        "사용자 세션을 확인해주세요.",
        "location_auth_required",
        401,
      );
    }
    const body = parseConsentUpdate(await request.json());
    const consent = await recordLocationConsent({ user, ...body });
    const response: LocationConsentResponse = {
      consent: {
        status: consent.status,
        termsVersion: consent.termsVersion,
        ageConfirmed: consent.ageConfirmed,
        updatedAt: consent.createdAt.toISOString(),
      },
    };
    return withCors(request, Response.json(response));
  } catch (error) {
    const complianceError =
      error instanceof LocationComplianceError ? error : null;
    const invalidJson = error instanceof SyntaxError;
    return withCors(
      request,
      Response.json(
        {
          error: complianceError
            ? complianceError.message
            : invalidJson
              ? "요청 본문을 확인해주세요."
              : "위치정보 동의 상태를 저장하지 못했어요.",
          code: complianceError?.code ?? "location_consent_record_failed",
        },
        { status: complianceError?.status ?? (invalidJson ? 400 : 500) },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function parseConsentUpdate(value: unknown): LocationConsentUpdate {
  if (!value || typeof value !== "object") {
    throw new SyntaxError("Invalid location consent request");
  }
  const input = value as Record<string, unknown>;
  const status = normalizeStatus(input.status);
  const termsVersion = String(input.termsVersion ?? "");
  const clientPlatform = normalizePlatform(input.clientPlatform);
  const ageConfirmed = input.ageConfirmed === true;

  if (termsVersion !== LOCATION_TERMS_VERSION) {
    throw new LocationComplianceError(
      "현재 위치기반서비스 약관을 다시 확인해주세요.",
      "location_consent_outdated",
      409,
    );
  }
  return { status, termsVersion, clientPlatform, ageConfirmed };
}

function normalizeStatus(value: unknown): LocationConsentStatus {
  if (
    value === "accepted" ||
    value === "paused" ||
    value === "declined" ||
    value === "withdrawn"
  ) {
    return value;
  }
  throw new SyntaxError("Invalid location consent status");
}

function normalizePlatform(value: unknown): LocationConsentUpdate["clientPlatform"] {
  return value === "ios" || value === "android" ? value : "web";
}
