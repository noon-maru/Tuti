import { prisma } from "@/server/db/prisma";
import { hashServiceTerms } from "./serviceTerms";
import { legalRuntimeFacts } from "./readiness";

const HEARTBEAT_ID = "legal-rights-maintenance-latest";

// 적용 작업과 알림 시도가 정상 반환된 뒤에만 호출한다. 알림 비활성은 전달 성공 증거가 아니다.
// 실패·조회 실행은 성공 증거가 아니다. 최근 실행은 예약 설치나 실제 통지 완료의 증거가 아니다.
export async function recordRightsMaintenanceSuccess(now = new Date()) {
  const data = { category: "legal_operations", action: "rights.maintenance.applied", message: "권리 침해 기한 점검 적용 완료", createdAt: now };
  await prisma.systemLog.upsert({
    where: { id: HEARTBEAT_ID }, create: { id: HEARTBEAT_ID, ...data }, update: data,
  });
}

export async function inspectLegalOperations(now = new Date(), env: Readonly<Record<string, string | undefined>> = process.env) {
  const facts = legalRuntimeFacts(env);
  const inspect = async <T>(operation: () => Promise<T>) => {
    try { return { status: "observed" as const, data: await operation() }; }
    catch { return { status: "unavailable" as const, data: null }; }
  };
  const terms = await inspect(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [current, upcoming, accounts] = await Promise.all([
      tx.serviceTermsRelease.findFirst({ where: { publishedAt: { lte: now }, effectiveAt: { lte: now } }, orderBy: { effectiveAt: "desc" } }),
      tx.serviceTermsRelease.findFirst({ where: { publishedAt: { lte: now }, effectiveAt: { gt: now } }, orderBy: { effectiveAt: "asc" } }),
      tx.user.count(),
    ]);
    const integrity = (release: typeof current) => !release || hashServiceTerms(release.document) === release.documentHash;
    const documentIntegrity = integrity(current) && integrity(upcoming);
    const currentAcceptances = current ? await tx.serviceTermsAcceptance.count({ where: {
      termsVersion: current.version, documentHash: current.documentHash, ageConfirmed: true, importantTermsConfirmed: true,
    } }) : 0;
    return {
      stage: !facts.serviceTermsWorkflow ? "disabled" : !current ? upcoming ? "notice_period" : "no_release"
        : facts.serviceTermsEnforcement ? "enforcing" : "effective_not_enforced",
      documentIntegrity, currentReleasePresent: Boolean(current), upcomingReleasePresent: Boolean(upcoming),
      accounts, currentAcceptances, accountsWithoutCurrentAcceptance: current ? Math.max(0, accounts - currentAcceptances) : null,
      // 집계는 약관 화면 제시·메일 전달·구버전 권리 경로의 실기기 시험을 증명하지 않는다.
      clientRolloutVerified: false,
    };
  }, { isolationLevel: "RepeatableRead" }));
  const rights = await inspect(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const active = { state: { notIn: ["closed", "expired"] } };
    const [activeCases, dueCases, pendingNotices, untriagedReports, lastRun] = await Promise.all([
      tx.journalRightsCase.count({ where: active }),
      tx.journalRightsCase.count({ where: { ...active, nextReviewAt: { lte: now } } }),
      tx.journalRightsNotice.count({ where: { status: { not: "manual_confirmed" } } }),
      tx.contentReport.count({ where: { reason: { in: ["privacy", "copyright"] }, status: { in: ["pending", "reviewing"] }, rightsCase: null } }),
      tx.systemLog.findUnique({ where: { id: HEARTBEAT_ID }, select: { category: true, action: true, createdAt: true } }),
    ]);
    const lastSuccess = lastRun?.category === "legal_operations" && lastRun.action === "rights.maintenance.applied" ? lastRun.createdAt : null;
    const elapsed = lastSuccess ? now.getTime() - lastSuccess.getTime() : null;
    return {
      workflowEnabled: facts.rightsWorkflow, activeCases, dueCases, pendingNotices,
      // 통상 신고를 법정 신청으로 단정하지 않고 분류 확인이 필요한 건수로 표시한다.
      potentialRightsReportsWithoutCase: untriagedReports,
      lastSuccessfulApplyAt: lastSuccess?.toISOString() ?? null,
      recentSuccessfulApplyObserved: elapsed !== null && elapsed >= 0 && elapsed <= 5 * 60_000,
      schedulerInstallationVerified: false, formalNoticeDeliveryVerified: false,
    };
  }, { isolationLevel: "RepeatableRead" }));
  return {
    scope: "read-only-database-observations-and-process-configuration", observedAt: now.toISOString(), facts, terms, rights,
    // 0건·최근 실행·플래그 true만으로 운영 이행을 승인하지 않는다.
    operationalCompletionVerified: false,
  };
}

// 포괄적 운영 승인 표시만으로 실제 점검 실행을 생략하지 못하게 하는 공고 전 추가 조건.
// 이것을 통과해도 예약 설치·법정 서식 전달·전체 운영 승인이 입증되는 것은 아니다.
export function assertLegalOperationsObserved(report: Awaited<ReturnType<typeof inspectLegalOperations>>) {
  if (report.terms.status !== "observed" || !report.terms.data?.documentIntegrity) {
    throw new Error("일반약관 DB 조회·원문 정합성을 확인하지 못했습니다.");
  }
  if (report.rights.status !== "observed" || !report.rights.data?.workflowEnabled || !report.rights.data.recentSuccessfulApplyObserved) {
    throw new Error("권리 보호 절차의 최근 적용 실행을 확인하지 못했습니다. 운영 점검·예약 작업·실패 알림을 확인해주세요.");
  }
}
