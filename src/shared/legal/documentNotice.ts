import type { ServiceTermsDocument } from "./serviceTerms";

export const LEGAL_DOCUMENT_TYPES = ["service-terms", "privacy", "location-terms", "community-guidelines"] as const;
export type LegalDocumentType = typeof LEGAL_DOCUMENT_TYPES[number];
export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  "service-terms": "서비스 이용약관", privacy: "개인정보 처리방침", "location-terms": "위치기반서비스 이용약관", "community-guidelines": "기록 공개 운영정책",
};
export type LegalDocumentNotice = {
  documentType: LegalDocumentType; version: string; document: ServiceTermsDocument; documentHash: string;
  publishedAt: string; plannedEffectiveAt: string; applicationPolicy: string;
};
