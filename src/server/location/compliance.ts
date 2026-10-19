import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import type { ExternalLocationProcessingMode } from "@/server/location/externalProcessing";
import { lockLocationSubject } from "@/server/location/subjectLock";
import { cancelLocationRequests, withLocationRequestScope } from "@/server/location/requestScope";
import { countLocationDerivedData, purgeLocationDerivedData } from "@/server/location/derivedData";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
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
  if (status === "accepted" && termsVersion !== LOCATION_TERMS_VERSION) {
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
    const replayReceipt = status === "withdrawn" ? await preparePrivacyReplayReceipt("location_withdrawn", user.id) : null;
    let withdrawalEffectiveAt: Date | undefined;
    const result = await prisma.$transaction(async (transaction) => {
      await lockLocationSubject(transaction, user.id);
      const current = await transaction.locationConsentEvent.findFirst({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const recordedVersion = status === "accepted" ? termsVersion : LOCATION_TERMS_VERSION;
      const confirmedAge = status === "accepted" ? ageConfirmed
        : status === "paused" && current?.termsVersion === LOCATION_TERMS_VERSION
          ? current.ageConfirmed : false;
      if (status === "withdrawn") {
        withdrawalEffectiveAt = new Date(Math.max(Date.now(), (current?.createdAt.getTime() ?? 0) + 1));
        // 철회는 단순 일시 중지와 다르다. 6개월 보존을 철회의 예외로 쓰지 않는다.
        await transaction.locationUsageLog.deleteMany({
          where: { OR: [{ userId: user.id }, { subjectKey: createSubjectKey(user.id) }] },
        });
        await transaction.locationConsentEvent.deleteMany({
          where: { userId: user.id, ...(current?.status === "withdrawn" ? { id: { not: current.id } } : {}) },
        });
        await purgeLocationDerivedData(transaction, user.id);
      }
      if (
        current?.status === status &&
        current.termsVersion === recordedVersion &&
        current.ageConfirmed === confirmedAge
      ) {
        return current;
      }
      return await transaction.locationConsentEvent.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          subjectKey: createSubjectKey(user.id),
          status,
          termsVersion: recordedVersion,
          ageConfirmed: confirmedAge,
          clientPlatform: normalizeClientPlatform(clientPlatform),
          // 같은 밀리초의 연속 변경도 최신 상태가 뒤집히지 않게 한다.
          createdAt: new Date(Math.max(Date.now(), (current?.createdAt.getTime() ?? 0) + 1)),
        },
        select: {
          id: true,
          status: true,
          termsVersion: true,
          ageConfirmed: true,
          createdAt: true,
        },
      });
    });
    if (status !== "accepted") cancelLocationRequests(user.id);
    // 원장 저장 지연 사이의 새 동의까지 철회 대상으로 소급하지 않는다.
    await commitPrivacyReplayReceipt(replayReceipt, new Date(Math.max(result.createdAt.getTime(), withdrawalEffectiveAt?.getTime() ?? 0)));
    return result;
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

export async function replayLocationWithdrawal(userId: string, effectiveAt: Date, apply: boolean) {
  return prisma.$transaction(async (transaction) => {
    await lockLocationSubject(transaction, userId);
    const current = await transaction.locationConsentEvent.findFirst({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    // 새 동의는 유지하되, 철회 이전 자료가 백업에서 함께 복원되어도 되살리지 않는다.
    if (current && current.status !== "withdrawn" && current.createdAt > effectiveAt) {
      if (apply) {
        await transaction.locationUsageLog.deleteMany({ where: {
          OR: [{ userId }, { subjectKey: createSubjectKey(userId) }], occurredAt: { lte: effectiveAt },
        } });
        await transaction.locationConsentEvent.deleteMany({ where: { userId, createdAt: { lte: effectiveAt } } });
        await purgeLocationDerivedData(transaction, userId, effectiveAt);
      }
      return { skipped: true };
    }
    if (!apply) return { skipped: false };
    await transaction.locationUsageLog.deleteMany({ where: { OR: [{ userId }, { subjectKey: createSubjectKey(userId) }] } });
    await purgeLocationDerivedData(transaction, userId);
    await transaction.locationConsentEvent.deleteMany({ where: { userId, ...(current?.status === "withdrawn" ? { id: { not: current.id } } : {}) } });
    if (current?.status !== "withdrawn") await transaction.locationConsentEvent.create({ data: {
      id: randomUUID(), userId, subjectKey: createSubjectKey(userId), status: "withdrawn", termsVersion: LOCATION_TERMS_VERSION,
      ageConfirmed: false, clientPlatform: "unknown", createdAt: new Date(Math.max(Date.now(), (current?.createdAt.getTime() ?? 0) + 1)),
    } });
    return { skipped: false };
  });
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

// 기존 철회자의 잔존 자료 정리. 실행 직전 상태를 잠금 아래 다시 확인한다.
// 이후 재동의한 이용자의 자료를 예전 철회 이벤트만 보고 지우지 않는다.
export async function purgeWithdrawnLocationSubject(userId: string, apply = false) {
  return prisma.$transaction(async (transaction) => {
    await lockLocationSubject(transaction, userId);
    const current = await transaction.locationConsentEvent.findFirst({
      where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (current?.status !== "withdrawn") return { skipped: true, usageLogs: 0, consentEvents: 0, recommendationRuns: 0, routeMetadata: 0 };
    const usageWhere = { OR: [{ userId }, { subjectKey: createSubjectKey(userId) }] };
    const consentWhere = { userId, id: { not: current.id } };
    const [usageLogs, consentEvents, derived] = await Promise.all([
      transaction.locationUsageLog.count({ where: usageWhere }),
      transaction.locationConsentEvent.count({ where: consentWhere }),
      countLocationDerivedData(transaction, userId),
    ]);
    if (apply) {
      await transaction.locationUsageLog.deleteMany({ where: usageWhere });
      await transaction.locationConsentEvent.deleteMany({ where: consentWhere });
      await purgeLocationDerivedData(transaction, userId);
      cancelLocationRequests(userId);
    }
    return { skipped: false, usageLogs, consentEvents, ...derived };
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
  return usageContext.run(context, () => withLocationRequestScope(user.id, async () => {
    const result = await operation();
    // 다른 워커에서의 철회도 DB 동의 세대로 확인한다. 재동의해도 예전 결과는 반환하지 않는다.
    const current = await requireCurrentLocationConsent(user);
    if (current.id !== consent.id) {
      throw new LocationComplianceError("위치 이용 설정이 변경되었어요. 다시 확인해주세요.", "location_consent_required", 403);
    }
    return result;
  }));
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

  await prisma.$transaction(async (transaction) => {
    await lockLocationSubject(transaction, context.userId);
    const consent = await transaction.locationConsentEvent.findFirst({
      where: { userId: context.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (consent?.id !== context.consentEventId || consent.status !== "accepted" ||
        !consent.ageConfirmed || consent.termsVersion !== LOCATION_TERMS_VERSION) {
      throw new LocationComplianceError(
        "위치정보 이용이 중단되었어요. 위치 설정을 확인해주세요.",
        "location_consent_required", 403,
      );
    }
    await transaction.locationUsageLog.create({
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
  });
}

function createSubjectKey(userId: string) {
  return createHash("sha256").update(`tuti-location:${userId}`).digest("hex");
}

function normalizeClientPlatform(value: string) {
  return value === "ios" || value === "android" ? value : "web";
}
