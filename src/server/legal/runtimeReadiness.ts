import { prisma } from "@/server/db/prisma";
import { legalReadinessBlockers, legalRuntimeFacts, parseLegalReadinessEvidence } from "@/server/legal/readiness";
import { readPrivacyReplaySnapshot } from "@/server/legal/privacyReplayLedger";

export async function assertServiceTermsOperationalReadiness(input: unknown, documentHash: string, approvalReference: string) {
  const evidence = parseLegalReadinessEvidence(input);
  const blockers = legalReadinessBlockers(evidence, legalRuntimeFacts());
  if (blockers.length) throw new Error(`시행 준비 미확인 항목: ${blockers.join(", ")}`);
  if (evidence.approvedDocumentHash !== documentHash || evidence.checks.finalDocumentApproval.reference !== approvalReference) throw new Error("최종 승인한 원문 해시·근거 번호가 공고하려는 문서와 다릅니다.");
  const snapshot = await readPrivacyReplaySnapshot();
  if (snapshot.unresolved) throw new Error("완료 여부가 불명확한 삭제·철회 요청을 먼저 확인해주세요.");
  await Promise.all([prisma.serviceTermsRelease.count(), prisma.serviceTermsAcceptance.count(), prisma.journalRightsCase.count(), prisma.journalRightsNotice.count()]);
  const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`SELECT tgname FROM pg_trigger WHERE tgrelid = 'service_terms_releases'::regclass AND tgname = 'service_terms_releases_immutable' AND tgenabled = 'O'`;
  if (triggers.length !== 1) throw new Error("공고 문서 변경 방지 DB 트리거를 확인하지 못했습니다.");
}
