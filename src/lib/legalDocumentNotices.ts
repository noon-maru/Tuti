import { apiUrl } from "@/lib/api/apiUrl";
import { parseServiceTermsDocument } from "@/shared/legal/serviceTerms";
import { LEGAL_DOCUMENT_TYPES, type LegalDocumentNotice, type LegalDocumentType } from "@/shared/legal/documentNotice";

// 계정 발급·인증·새 규약 협상 없이 누구나 열람하는 공고 원문이다.
export async function fetchLegalDocumentNotices(): Promise<LegalDocumentNotice[]> {
  const response = await fetch(apiUrl("public/legal-notices"), { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return []; // 이 API가 없는 구서버와 앱 선출시 호환.
  if (!response.ok) throw new Error("개정 공고를 불러오지 못했어요.");
  const data = await response.json();
  if (!data || !Array.isArray(data.notices) || data.notices.length > LEGAL_DOCUMENT_TYPES.length) throw new Error("개정 공고 응답을 확인하지 못했어요.");
  const seen = new Set<string>();
  return data.notices.map((notice: LegalDocumentNotice) => {
    if (!notice || !LEGAL_DOCUMENT_TYPES.includes(notice.documentType as LegalDocumentType) || seen.has(notice.documentType) ||
        typeof notice.version !== "string" || !notice.version || typeof notice.documentHash !== "string" || !/^[a-f0-9]{64}$/.test(notice.documentHash) ||
        typeof notice.applicationPolicy !== "string" || !notice.applicationPolicy.trim() || typeof notice.publishedAt !== "string" ||
        !Number.isFinite(Date.parse(notice.publishedAt)) || typeof notice.plannedEffectiveAt !== "string" || !Number.isFinite(Date.parse(notice.plannedEffectiveAt))) throw new Error("개정 공고 응답을 확인하지 못했어요.");
    seen.add(notice.documentType);
    return { ...notice, document: parseServiceTermsDocument(notice.document) };
  });
}
