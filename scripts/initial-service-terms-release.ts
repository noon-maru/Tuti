import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/server/db/prisma";
import documents from "../src/shared/legal/finalizedDocuments.json";
import { prepareServiceTermsRelease, RELEASE_READINESS_CHECKS } from "../src/server/legal/releaseApproval";
import { hashServiceTerms, serviceTermsEnforcementEnabled, serviceTermsWorkflowEnabled } from "../src/server/legal/serviceTerms";
import { assertServiceTermsOperationalReadiness } from "../src/server/legal/runtimeReadiness";
import { legalReadinessReport, legalRuntimeFacts, parseLegalReadinessEvidence } from "../src/server/legal/readiness";
import { prepareLegalDocumentNotice } from "../src/server/legal/documentNotice";

export function isInitialNoticeApproval(args: string[]) {
  return args.length === 2 && args[0] === "--announce" && args[1] === "--approve-initial-contract";
}

export function preexistingOrdinaryAccountFilter(effectiveAt: Date) {
  if (!Number.isFinite(effectiveAt.getTime())) throw new Error("최초 적용 시각이 올바르지 않습니다.");
  return { role: { not: "admin" as const }, createdAt: { lte: effectiveAt } };
}

export function initialNotices(evidence: unknown, now: Date) {
  return Object.entries(documents).map(([documentType, bundled]) => prepareLegalDocumentNotice({
    documentType, version: bundled.version, document: bundled.document, publicationMode: "initial",
    plannedEffectiveAt: now.toISOString(), approvalReference: parseLegalReadinessEvidence(evidence).checks.finalDocumentApproval.reference,
    applicationPolicy: "운영자가 테스트 이용 종료와 기존 의무를 검토한 뒤 신규 계약에 한정해 최초 적용합니다. 일반약관 최초 적용 릴리스는 별도로 등록되어 있으며 공고 자체가 이용자 동의는 아닙니다. 개인정보·위치·기록 공개 문서의 실제 서버 전환 시각은 별도로 표시하며 위치·민감정보·공개의 별도 확인 절차를 유지합니다.",
  }, { ...(evidence as Record<string, unknown>), approvedDocumentHash: bundled.documentHash }, now));
}

export function parseInitialReleaseArguments(args: string[]) {
  if (args.length === 1 && args[0] === "--check") return false;
  if (args.length === 2 && args[0] === "--apply" && args[1] === "--approve-initial-contract") return true;
  throw new Error("--check 또는 --apply --approve-initial-contract 형식만 지원합니다.");
}

export function initialReleaseCandidate(input: unknown, now: Date) {
  const evidence = parseLegalReadinessEvidence(input);
  const bundled = documents["service-terms"];
  if (bundled.version !== "2026-10-22" || hashServiceTerms(bundled.document) !== bundled.documentHash ||
      evidence.approvedDocumentHash !== bundled.documentHash || !evidence.checks.finalDocumentApproval.confirmed) {
    throw new Error("승인 기록과 실행 이미지의 약관 원문이 다릅니다.");
  }
  return prepareServiceTermsRelease({
    version: bundled.version, document: bundled.document,
    approvalReference: evidence.checks.finalDocumentApproval.reference,
    publicationMode: "initial", effectiveAt: "immediate",
    readiness: Object.fromEntries(RELEASE_READINESS_CHECKS.map(key => [key, true])),
    // 후보 구성용 값이다. 실제 등록은 운영자의 명시적 승인 인자를 별도로 요구한다.
    initialContractApproval: { reference: "INITIAL-TEST-CLOSURE-20261023", testUseEnded: true, priorObligationsReviewed: true, newContractsOnly: true },
  }, now);
}

async function main() {
  const announce = isInitialNoticeApproval(process.argv.slice(2));
  const apply = announce ? false : parseInitialReleaseArguments(process.argv.slice(2));
  const evidence: unknown = JSON.parse(await readFile("/initial-terms/readiness.json", "utf8"));
  const report = legalReadinessReport(parseLegalReadinessEvidence(evidence), legalRuntimeFacts(), "service-terms");
  if (!report.ready) throw new Error(`준비 미확인: ${report.blockers.join(", ")}`);
  if (!serviceTermsWorkflowEnabled() || serviceTermsEnforcementEnabled()) throw new Error("공개 기능 ON·강제 동의 OFF 상태에서만 등록할 수 있습니다.");
  const candidate = initialReleaseCandidate(evidence, new Date());
  // 조회 모드에도 원장·최근 권리 작업·원문 불변성 등 기존 운영 검사를 수행한다.
  await assertServiceTermsOperationalReadiness(evidence, candidate.documentHash, candidate.approvalReference);
  const initialGuard = await prisma.$queryRaw<Array<{ tgname: string }>>`SELECT tgname FROM pg_trigger WHERE tgrelid = 'service_terms_releases'::regclass AND tgname = 'service_terms_releases_initial_guard' AND tgenabled = 'O'`;
  if (initialGuard.length !== 1) throw new Error("최초 적용 DB 보호 트리거가 없습니다.");
  if (announce) {
    const notices = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261019, 1)::text AS lock_result`;
      await tx.$executeRaw`LOCK TABLE users IN SHARE MODE`;
      const current = await tx.serviceTermsRelease.findUnique({ where: { version: candidate.version } });
      const now = new Date();
      if (!current || current.publicationMode !== "initial" || current.documentHash !== candidate.documentHash ||
          current.effectiveAt > now || current.approvalReference !== candidate.approvalReference || hashServiceTerms(current.document) !== candidate.documentHash ||
          current.initialContractReference !== candidate.initialContractReference ||
          await tx.serviceTermsRelease.count() !== 1 || await tx.legalDocumentNotice.count()) {
        throw new Error("등록된 최초 약관·승인 근거·기존 공고 조건이 맞지 않습니다. 공고하지 않습니다.");
      }
      // 최초 릴리스 INSERT 때 DB가 일반 계정 0개를 이미 보장했다.
      // 그 뒤 생긴 신규 계정은 삭제 대상이 아니며 이후 강제 동의에서 영수증을 확인한다.
      // 반대로 최초 적용 이전 계정이 복원·유입됐다면 여전히 중단한다.
      const preexistingAccounts = await tx.user.count({ where: preexistingOrdinaryAccountFilter(current.effectiveAt) });
      if (preexistingAccounts) throw new Error(`최초 적용 시점 이전의 일반 계정이 ${preexistingAccounts}개 있습니다. 공고하지 않습니다. 계정을 자동 삭제하지 않습니다.`);
      const prepared = initialNotices(evidence, now);
      for (const notice of prepared) await tx.legalDocumentNotice.create({ data: notice });
      return prepared.map(({ documentType, version, documentHash, publishedAt, plannedEffectiveAt }) => ({ documentType, version, documentHash, publishedAt, plannedEffectiveAt }));
    });
    console.log(JSON.stringify({ mode: "announced", notices, enforcementChanged: false, policySettingsChanged: false, consentsCreated: false }));
    return;
  }
  if (!apply) {
    const counts = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return { ordinaryAccounts: await tx.user.count({ where: { role: { not: "admin" } } }), releases: await tx.serviceTermsRelease.count(), notices: await tx.legalDocumentNotice.count() };
    }, { isolationLevel: "RepeatableRead" });
    console.log(JSON.stringify({ mode: "check", ...counts, version: candidate.version, documentHash: candidate.documentHash, approvalReference: candidate.approvalReference,
      operatorApprovalRequired: true, requiredApprovalScope: "테스트 이용 종료·기존 계약 및 고지/보존 의무 검토·향후 신규 계약에 한정한 최초 적용", databaseChanged: false, enforcementChanged: false }));
    if (Object.values(counts).some(count => count !== 0)) throw new Error("일반 계정 또는 기존 릴리스·공고가 있습니다. 최초 적용 범위를 다시 확인해주세요.");
    return;
  }
  // 테이블 잠금과 DB 트리거 양쪽으로 새 가입·중복 등록 경합을 방지한다.
  const release = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261019, 1)::text AS lock_result`;
    await tx.$executeRaw`LOCK TABLE users IN SHARE MODE`;
    if (await tx.user.count({ where: { role: { not: "admin" } } }) || await tx.serviceTermsRelease.count() || await tx.legalDocumentNotice.count()) throw new Error("조회 후 계정·릴리스·공고가 변경됐습니다. 등록하지 않습니다.");
    const current = initialReleaseCandidate(evidence, new Date());
    await tx.serviceTermsRelease.create({ data: current });
    return current;
  });
  console.log(JSON.stringify({ mode: "registered", version: release.version, documentHash: release.documentHash, effectiveAt: release.effectiveAt,
    publicationMode: release.publicationMode, initialContractReference: release.initialContractReference, enforcementChanged: false, policySettingsChanged: false, consentsCreated: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error && error.name === "Error" ? error.message : "최초 약관 등록 검사에 실패했습니다. DB·원장·실행 환경을 점검해주세요. 상세 원문은 출력하지 않습니다."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
