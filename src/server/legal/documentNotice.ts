import { prisma } from "@/server/db/prisma";
import { hashServiceTerms } from "./serviceTerms";
import { legalNoticeReadinessBlockers, parseLegalReadinessEvidence } from "./readiness";
import { parseServiceTermsDocument } from "@/shared/legal/serviceTerms";
import { LEGAL_DOCUMENT_TYPES, type LegalDocumentType, type LegalDocumentNotice } from "@/shared/legal/documentNotice";

// 문서 내용·공고 계획의 승인은 유지한다. 앱 출시·계정 정리·예약 작업은 시행 때 확인한다.
export { LEGAL_NOTICE_CHECKS } from "./readiness";

export function prepareLegalDocumentNotice(input: unknown, evidenceInput: unknown, now = new Date()) {
  if (!input || typeof input !== "object") throw new Error("승인된 공고 원문이 필요합니다.");
  const data = input as Record<string, unknown>;
  if (!LEGAL_DOCUMENT_TYPES.includes(data.documentType as LegalDocumentType)) throw new Error("공고 문서 종류를 확인해주세요.");
  if (typeof data.version !== "string" || !/^\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(data.version)) throw new Error("공고 버전을 확인해주세요.");
  const document = parseServiceTermsDocument(data.document);
  const documentHash = hashServiceTerms(document);
  const evidence = parseLegalReadinessEvidence(evidenceInput);
  const missing = legalNoticeReadinessBlockers(evidence);
  if (missing.length) throw new Error(`공고 문서 승인 미확인: ${missing.join(", ")}`);
  if (evidence.approvedDocumentHash !== documentHash || data.approvalReference !== evidence.checks.finalDocumentApproval.reference) throw new Error("공고 원문 해시·승인 근거가 승인 기록과 다릅니다.");
  const publicationMode = data.publicationMode ?? "amendment";
  if (publicationMode !== "amendment" && publicationMode !== "initial") throw new Error("공고 유형을 확인해주세요.");
  const plannedEffectiveAt = new Date(typeof data.plannedEffectiveAt === "string" ? data.plannedEffectiveAt : "");
  const days = publicationMode === "amendment" ? 30 : 0;
  if (!Number.isFinite(plannedEffectiveAt.getTime()) || plannedEffectiveAt.getTime() < now.getTime() + days * 86400000) throw new Error(`시행 예정일은 공고 시각부터 최소 ${days}일 이후여야 합니다.`);
  if (typeof data.applicationPolicy !== "string" || !data.applicationPolicy.trim() || data.applicationPolicy.length > 2000 || /초안|미확정|TODO|TBD/i.test(data.applicationPolicy)) throw new Error("적용 대상·동의 전환 안내를 확정해주세요.");
  return { documentType: data.documentType as LegalDocumentType, version: data.version, document, documentHash,
    publishedAt: now, plannedEffectiveAt, publicationMode, approvalReference: data.approvalReference as string, applicationPolicy: data.applicationPolicy.trim() };
}

export async function listLegalDocumentNotices(now = new Date()): Promise<LegalDocumentNotice[]> {
  const rows = await Promise.all(LEGAL_DOCUMENT_TYPES.map(documentType => prisma.legalDocumentNotice.findFirst({ where: { documentType, publishedAt: { lte: now } }, orderBy: [{ publishedAt: "desc" }, { version: "desc" }] })));
  return rows.flatMap(row => {
    if (!row) return [];
    const document = parseServiceTermsDocument(row.document);
    if (hashServiceTerms(document) !== row.documentHash) throw new Error("Legal notice integrity check failed");
    return [{ documentType: row.documentType as LegalDocumentType, version: row.version, document, documentHash: row.documentHash,
      publishedAt: row.publishedAt.toISOString(), plannedEffectiveAt: row.plannedEffectiveAt.toISOString(), applicationPolicy: row.applicationPolicy }];
  });
}
