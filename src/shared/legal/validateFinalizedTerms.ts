import documents from "./finalizedDocuments.json";
import { parseServiceTermsDocument } from "./serviceTerms";

export function validateFinalizedTermsReference(offer: { version: string; documentHash: string }) {
  const finalized = documents["service-terms"];
  if (offer.version === finalized.version && offer.documentHash !== finalized.documentHash) {
    throw new Error("이용약관 버전과 원문이 일치하지 않아요. 운영팀에 문의해주세요.");
  }
}

// 같은 버전 이름에 다른 원문을 연결한 배포 오류를 동의 전에 차단한다.
export function validateFinalizedTerms(status: { current?: unknown; upcoming?: unknown }) {
  for (const candidate of [status.current, status.upcoming]) {
    if (!candidate || typeof candidate !== "object") continue;
    const offer = candidate as Record<string, unknown>;
    const finalized = documents["service-terms"];
    if (offer.version === finalized.version && (offer.documentHash !== finalized.documentHash ||
        JSON.stringify(parseServiceTermsDocument(offer.document)) !== JSON.stringify(finalized.document))) {
      throw new Error("이용약관 버전과 원문이 일치하지 않아요. 운영팀에 문의해주세요.");
    }
  }
}
