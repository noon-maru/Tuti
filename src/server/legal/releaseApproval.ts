import { hashServiceTerms } from "@/server/legal/serviceTerms";
import { parseServiceTermsDocument } from "@/shared/legal/serviceTerms";

// 일반약관 원문과 적용 범위의 승인이다. 개인정보방침·푸시 이전 동의의 승인이 아니다.
// 같은 이름의 processorsAndTransfers/nativeClientRollout도 이 문서의 검토·전환 범위를 뜻한다.
export const RELEASE_READINESS_CHECKS = [
  "processingInventory", "processorsAndTransfers", "backupDeletion", "rightsWorkflow",
  "minorProtection", "legalReview", "nativeClientRollout", "noticePlan",
] as const;

export function prepareServiceTermsRelease(input: unknown, now = new Date()) {
  if (!input || typeof input !== "object") throw new Error("승인된 문서가 필요합니다.");
  const data = input as Record<string, unknown>;
  if (typeof data.version !== "string" || !/^\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(data.version)) throw new Error("약관 버전을 확인해주세요.");
  if (typeof data.approvalReference !== "string" || !/^[a-zA-Z0-9_-]{3,100}$/.test(data.approvalReference)) throw new Error("최종 승인 근거 번호가 필요합니다.");
  const checks = data.readiness as Record<string, unknown> | undefined;
  const missing = RELEASE_READINESS_CHECKS.filter((key) => checks?.[key] !== true);
  if (missing.length) throw new Error(`시행 전 확인이 완료되지 않았습니다: ${missing.join(", ")}`);
  // 30일은 이번 전면 개편의 보수적 운영 기준이며 모든 변경의 일률적 법정 기간은 아니다.
  const publicationMode = data.publicationMode ?? "amendment";
  if (publicationMode !== "amendment" && publicationMode !== "initial") throw new Error("공고 유형을 확인해주세요.");
  const effectiveAt = publicationMode === "initial" && data.effectiveAt === "immediate" ? now : new Date(typeof data.effectiveAt === "string" ? data.effectiveAt : "");
  let initialContractReference: string | null = null;
  if (publicationMode === "initial") {
    const approval = data.initialContractApproval as Record<string, unknown> | undefined;
    if (approval?.testUseEnded !== true || approval.priorObligationsReviewed !== true || approval.newContractsOnly !== true ||
        typeof approval.reference !== "string" || !/^[a-zA-Z0-9_-]{3,100}$/.test(approval.reference)) {
      throw new Error("최초 계약 적용에는 테스트 이용 종료·기존 의무 검토·신규 계약 한정의 별도 승인 근거가 필요합니다.");
    }
    initialContractReference = approval.reference;
  }
  const noticeDays = publicationMode === "initial" ? 0 : 30;
  if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt.getTime() < now.getTime() + noticeDays * 86400000) throw new Error(publicationMode === "initial" ? "최초 계약 시행일은 공고 시점보다 빠를 수 없습니다." : "공고 시점부터 최소 30일 이후의 시행일을 지정해주세요.");
  const document = parseServiceTermsDocument(data.document);
  return { version: data.version, document, documentHash: hashServiceTerms(document), publishedAt: now, effectiveAt, approvalReference: data.approvalReference, noticeDays, publicationMode, initialContractReference };
}
