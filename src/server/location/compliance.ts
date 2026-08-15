import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import type { ExternalLocationProcessingMode } from "@/server/location/externalProcessing";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import type { LocationConsentStatus } from "@/shared/tuti/types";

export type LocationAcquisitionSource = "device" | "photo_exif";
export type LocationUsageService =
  | "recommendation"
  | "travel_time"
  | "departure_plan"
  | "photo_nearby";

type LocationUsageContext = {
  userId: string;
  subjectKey: string;
  consentEventId: string;
  termsVersion: string;
  acquisitionSource: LocationAcquisitionSource;
  service: LocationUsageService;
};

export type CurrentLocationConsent = {
  id: string;
  status: LocationConsentStatus;
  termsVersion: string;
  ageConfirmed: boolean;
  createdAt: Date;
};

export class LocationComplianceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "location_auth_required"
      | "location_consent_required"
      | "location_consent_outdated"
      | "location_consent_record_failed",
    readonly status: number,
  ) {
    super(message);
    this.name = "LocationComplianceError";
  }
}

const usageContext = new AsyncLocalStorage<LocationUsageContext>();

export async function recordLocationConsent({
  user,
  status,
  termsVersion,
  ageConfirmed,
  clientPlatform,
}: {
  user: AuthenticatedUser;
  status: LocationConsentStatus;
  termsVersion: string;
  ageConfirmed: boolean;
  clientPlatform: string;
}) {
  if (termsVersion !== LOCATION_TERMS_VERSION) {
    throw new LocationComplianceError(
      "현재 위치기반서비스 약관을 다시 확인해주세요.",
      "location_consent_outdated",
      409,
    );
  }
  if (status === "accepted" && !ageConfirmed) {
    throw new LocationComplianceError(
      "만 14세 이상 확인과 약관 동의가 필요해요.",
      "location_consent_required",
      400,
    );
  }

  try {
    const current = await getCurrentLocationConsent(user.id);
    if (
      current?.status === status &&
      current.termsVersion === termsVersion &&
      current.ageConfirmed === (status === "accepted" && ageConfirmed)
    ) {
      return current;
    }
    return await prisma.locationConsentEvent.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        subjectKey: createSubjectKey(user.id),
        status,
        termsVersion,
        ageConfirmed: status === "accepted" && ageConfirmed,
        clientPlatform: normalizeClientPlatform(clientPlatform),
      },
      select: {
        id: true,
        status: true,
        termsVersion: true,
        ageConfirmed: true,
        createdAt: true,
      },
    });
  } catch (error) {
    console.error("위치정보 동의 기록을 저장하지 못했습니다.", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    throw new LocationComplianceError(
      "위치정보 동의를 안전하게 기록하지 못했어요.",
      "location_consent_record_failed",
      503,
    );
  }
}

export async function getCurrentLocationConsent(userId: string) {
  return prisma.locationConsentEvent.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      termsVersion: true,
      ageConfirmed: true,
      createdAt: true,
    },
  });
}

export async function requireCurrentLocationConsent(
  user: AuthenticatedUser | null,
): Promise<CurrentLocationConsent> {
  if (!user) {
    throw new LocationComplianceError(
      "위치정보 이용을 확인할 사용자 세션이 필요해요.",
      "location_auth_required",
      401,
    );
  }

  const consent = await getCurrentLocationConsent(user.id);
  if (!consent || consent.status !== "accepted" || !consent.ageConfirmed) {
    throw new LocationComplianceError(
      "현재 위치를 사용하려면 위치기반서비스 약관 동의가 필요해요.",
      "location_consent_required",
      403,
    );
  }
  if (consent.termsVersion !== LOCATION_TERMS_VERSION) {
    throw new LocationComplianceError(
      "위치기반서비스 약관이 변경되어 다시 동의가 필요해요.",
      "location_consent_outdated",
      409,
    );
  }
  return consent;
}

export async function runWithLocationUsage<Result>({
  user,
  consent,
  acquisitionSource,
  service,
  method,
  operation,
}: {
  user: AuthenticatedUser;
  consent: CurrentLocationConsent;
  acquisitionSource: LocationAcquisitionSource;
  service: LocationUsageService;
  method: string;
  operation: () => Promise<Result>;
}) {
  const context: LocationUsageContext = {
    userId: user.id,
    subjectKey: createSubjectKey(user.id),
    consentEventId: consent.id,
    termsVersion: consent.termsVersion,
    acquisitionSource,
    service,
  };

  await createUsageLog(context, {
    kind: "internal_use",
    method,
  });
  return usageContext.run(context, operation);
}

export async function recordExternalLocationTransfer({
  recipient,
  purpose,
  method,
  mode,
}: {
  recipient: "Kakao" | "Kakao Mobility";
  purpose: string;
  method: string;
  mode: ExternalLocationProcessingMode;
}) {
  const context = usageContext.getStore();
  if (!context) {
    throw new LocationComplianceError(
      "외부 위치정보 처리를 기록할 수 없어 요청을 중단했어요.",
      "location_consent_record_failed",
      503,
    );
  }
  await createUsageLog(context, {
    kind: "external_transfer",
    method,
    externalRecipient: recipient,
    externalPurpose: purpose,
    externalMode: mode,
  });
}

async function createUsageLog(
  context: LocationUsageContext,
  input: {
    kind: "internal_use" | "external_transfer";
    method: string;
    externalRecipient?: string;
    externalPurpose?: string;
    externalMode?: string;
  },
) {
  const occurredAt = new Date();
  const retentionUntil = new Date(occurredAt);
  retentionUntil.setUTCMonth(retentionUntil.getUTCMonth() + 6);

  await prisma.locationUsageLog.create({
    data: {
      id: randomUUID(),
      userId: context.userId,
      subjectKey: context.subjectKey,
      consentEventId: context.consentEventId,
      termsVersion: context.termsVersion,
      acquisitionSource: context.acquisitionSource,
      service: context.service,
      kind: input.kind,
      method: input.method,
      externalRecipient: input.externalRecipient,
      externalPurpose: input.externalPurpose,
      externalMode: input.externalMode,
      occurredAt,
      retentionUntil,
    },
  });
}

function createSubjectKey(userId: string) {
  return createHash("sha256").update(`tuti-location:${userId}`).digest("hex");
}

function normalizeClientPlatform(value: string) {
  return value === "ios" || value === "android" ? value : "web";
}
