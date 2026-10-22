import { createHash } from "node:crypto";
import { parseServiceTermsDocument, type ServiceTermsDocument } from "@/shared/legal/serviceTerms";
import { prepareServiceTermsReview } from "./noticePreparation";
import { legalNoticeReadinessBlockers, parseLegalReadinessEvidence } from "./readiness";

export const FINAL_NOTICE_FILES = {
  "service-terms": "service-terms.md",
  privacy: "privacy-policy.md",
  "location-terms": "location-terms.md",
  "community-guidelines": "publication-policy.md",
} as const;
type Kind = keyof typeof FINAL_NOTICE_FILES;
const descriptions: Record<Kind, { title: string; summary: string; importantTerms: string[] }> = {
  "service-terms": { title: "Tuti 서비스 이용약관", summary: "일반약관", importantTerms: ["적용 원문에 명시적으로 동의합니다."] },
  privacy: { title: "Tuti 개인정보 처리방침", summary: "처리 항목·근거·보유기간, 외부 처리와 권리 행사 방법을 안내합니다.", importantTerms: [
    "일반약관 동의는 모든 개인정보 처리 동의가 아닙니다. 위치·민감정보 등에 필요한 동의는 별도입니다.",
    "요청한 웹/API·인증·문의 답변 알림의 국외 위탁·보관은 계약 이행과 방침 공개 근거로 안내합니다. 미국 소재 수령자와 글로벌 처리시설 범위를 함께 표시합니다.",
    "최소 이용 분석·보안·감사는 정당한 이익과 해당 안전조치 의무를 구분합니다. 원문 AI 분석·광고 추적의 포괄 허용이 아니며 처리정지·삭제를 요청할 수 있습니다.",
  ] },
  "location-terms": { title: "Tuti 위치기반서비스 이용약관", summary: "선택한 위치 기능·외부 경로 계산, 보유·파기와 이용자의 권리를 안내합니다.", importantTerms: [
    "위치 이용 동의와 기기 권한은 별도이며 위치 없이 이용할 수 있는 기능은 유지합니다.",
    "철회 범위의 개인위치정보와 이용·제공사실 확인자료는 통상 보관기간이 남아 있어도 지체 없이 파기합니다.",
  ] },
  "community-guidelines": { title: "Tuti 기록 공개 운영정책", summary: "기록 공개의 범위, 민감정보 제한, 신고·차단·권리 대응 절차를 안내합니다.", importantTerms: [
    "기록은 기본 비공개입니다. 본인의 민감정보 보관 동의가 있어도 해당 기록을 웹 링크로 공개할 수 없습니다.",
    "작성자 차단은 내가 그 작성자의 공개 기록을 보지 않는 기능이며 상대방의 나에 대한 접근을 차단하는 기능이 아닙니다.",
  ] },
};
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function paragraph(block: string) {
  if (block.startsWith("|")) {
    const rows = block.split("\n").map(line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()));
    if (rows.length < 3 || !rows[1].every(cell => /^:?-+:?$/.test(cell))) throw new Error("LEGAL_TABLE_INVALID");
    const [headers] = rows;
    return rows.slice(2).map(row => {
      if (row.length !== headers.length) throw new Error("LEGAL_TABLE_INVALID");
      return row.map((cell, i) => `${headers[i]}: ${cell}`).join(" · ");
    }).join("\n");
  }
  return block.split("\n").map(line => line.trim().replace(/^### /, "")).join(block.startsWith("- ") ? "\n" : " ");
}

export function parseFinalNoticeMarkdown(kind: Kind, source: string): ServiceTermsDocument {
  const parts = source.replaceAll("\r\n", "\n").trim().split(/^## /m);
  if (parts[0].trim() !== `# ${descriptions[kind].title}`) throw new Error("LEGAL_FINAL_TITLE_INVALID");
  return parseServiceTermsDocument({ ...descriptions[kind], sections: parts.slice(1).map(part => {
    const newline = part.indexOf("\n");
    if (newline < 0) throw new Error("LEGAL_FINAL_SECTION_INVALID");
    return { title: part.slice(0, newline).trim(), paragraphs: part.slice(newline + 1).trim().split(/\n\s*\n/).map(paragraph) };
  }) });
}

/** Pure preparation only: no database, environment changes, publication or consent creation. */
export function prepareFinalNoticeBundle(input: {
  sources: Record<Kind, string>; serviceTermsDraft: string; manifest: unknown; readiness: unknown;
  effectiveAt?: string; now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("LEGAL_PLAN_DATE_INVALID");
  const manifest = input.manifest as { operatorFinalApproval?: unknown; textApprovalReference?: unknown; documents?: Array<{ documentType: string; file: string; markdownSha256: string }> } | null;
  if (!manifest || manifest.operatorFinalApproval !== true || typeof manifest.textApprovalReference !== "string" ||
      !/^[A-Za-z0-9_-]{3,100}$/.test(manifest.textApprovalReference) || !Array.isArray(manifest.documents) || manifest.documents.length !== 4) throw new Error("LEGAL_TEXT_APPROVAL_REQUIRED");
  const evidence = parseLegalReadinessEvidence(input.readiness);
  const blockers = legalNoticeReadinessBlockers(evidence);
  if (blockers.length) throw new Error(`LEGAL_NOTICE_NOT_READY: ${blockers.join(",")}`);
  if (evidence.checks.finalDocumentApproval.reference !== manifest.textApprovalReference) throw new Error("LEGAL_TEXT_APPROVAL_MISMATCH");
  let plannedEffectiveAt: string | undefined;
  if (input.effectiveAt !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.effectiveAt)) throw new Error("LEGAL_PLAN_DATE_INVALID");
    const date = new Date(input.effectiveAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() < now.getTime() + 30 * 86400000) throw new Error("LEGAL_PLAN_REQUIRES_30_DAYS");
    plannedEffectiveAt = date.toISOString();
  }
  const general = prepareServiceTermsReview(input.serviceTermsDraft).document;
  const entries = Object.entries(FINAL_NOTICE_FILES).map(([key, file]) => {
    const kind = key as Kind;
    const source = input.sources[kind];
    const matching = manifest.documents!.filter(item => item.documentType === kind);
    if (matching.length !== 1 || matching[0].file !== file || matching[0].markdownSha256 !== sha(source)) throw new Error("LEGAL_FINAL_SOURCE_CHANGED");
    const parsed = parseFinalNoticeMarkdown(kind, source);
    if (kind === "service-terms" && JSON.stringify(parsed.sections) !== JSON.stringify(general.sections)) throw new Error("LEGAL_GENERAL_DOCUMENT_MISMATCH");
    const document = kind === "service-terms" ? general : parsed;
    const documentHash = sha(JSON.stringify(document));
    if (kind === "service-terms" && documentHash !== evidence.approvedDocumentHash) throw new Error("LEGAL_GENERAL_APPROVAL_HASH_MISMATCH");
    const readiness = { ...(input.readiness as Record<string, unknown>), approvedDocumentHash: documentHash };
    return { documentType: kind, documentHash, notice: {
      documentType: kind, version: "2026-10-22", document, publicationMode: "amendment",
      ...(plannedEffectiveAt ? { plannedEffectiveAt } : {}), approvalReference: manifest.textApprovalReference,
      applicationPolicy: "새 앱 출시 후 서버 전환에 맞춰 적용하며 신규·기존 이용자 모두 적용 일반약관에 명시적으로 동의합니다. 위치·민감정보·기록 공개의 별도 절차는 유지합니다. 공고 열람·앱 업데이트는 동의가 아니며 예정일만으로 강제 기능을 자동 활성화하지 않습니다.",
    }, readiness };
  });
  return { scope: "prepared-not-announced-or-enforced", generatedAt: now.toISOString(), scheduled: !!plannedEffectiveAt,
    announcementApplied: false, enforcementApplied: false, accountsDeleted: false, legalComplianceCertified: false,
    followUpReview: "제공자 글로벌 처리 범위·목적형 기간·계약 필요성과 정당한 이익 판단의 후속 법률자문. 공고 준비의 반복 대기 조건은 아님", entries };
}
