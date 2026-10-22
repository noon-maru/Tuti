import type { LegalPolicyRelease } from "./policyRelease";

export type ServiceTermsDocument = {
  title: string;
  summary: string;
  importantTerms: string[];
  sections: Array<{ title: string; paragraphs: string[] }>;
};

export type ServiceTermsOffer = {
  version: string;
  documentHash: string;
  document: ServiceTermsDocument;
  publishedAt: string;
  effectiveAt: string;
  accepted: boolean;
};

export type ServiceTermsStatus = {
  current: ServiceTermsOffer | null;
  upcoming: ServiceTermsOffer | null;
  required: boolean;
  // 구서버 응답에는 없다. 문서/미동의 여부와 실제 진입 강제 전환을 구분한다.
  enforcementEnabled?: boolean;
  legalPolicyRelease?: LegalPolicyRelease | null;
};

export const EMPTY_SERVICE_TERMS_STATUS: ServiceTermsStatus = {
  current: null, upcoming: null, required: false, enforcementEnabled: false,
};

export function parseServiceTermsDocument(value: unknown): ServiceTermsDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid terms document");
  const data = value as Record<string, unknown>;
  const text = (input: unknown, maximum: number) => {
    if (typeof input !== "string" || !input.trim() || input.length > maximum) throw new Error("Invalid terms text");
    return input.trim();
  };
  if (!Array.isArray(data.importantTerms) || data.importantTerms.length < 1 || data.importantTerms.length > 12 ||
      !Array.isArray(data.sections) || data.sections.length < 1 || data.sections.length > 50) throw new Error("Invalid terms sections");
  const document = {
    title: text(data.title, 120),
    summary: text(data.summary, 2000),
    importantTerms: data.importantTerms.map((item) => text(item, 2000)),
    sections: data.sections.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Invalid terms section");
      const section = item as Record<string, unknown>;
      if (!Array.isArray(section.paragraphs) || section.paragraphs.length < 1 || section.paragraphs.length > 30) throw new Error("Invalid terms paragraphs");
      return { title: text(section.title, 200), paragraphs: section.paragraphs.map((paragraph) => text(paragraph, 10000)) };
    }),
  };
  if (JSON.stringify(document).length > 300000) throw new Error("Terms document is too large");
  if (/초안|미확정|공개 전|시행일 미정|\[확정|TODO|TBD/i.test(JSON.stringify(document))) throw new Error("Unapproved draft text cannot be published");
  return document;
}

// 거부하더라도 기존 자료 열람·내보내기·삭제와 권리 행사는 유지한다.
export function normalizeLegalPathname(pathname: string): string | null {
  try { return decodeURIComponent(pathname).replace(/\/+$/, ""); } catch { return null; }
}

export function requiresServiceTerms(pathname: string, method: string) {
  const normalized = normalizeLegalPathname(pathname);
  if (normalized === null) return false;
  pathname = normalized;
  if (method === "OPTIONS" || method === "DELETE") return false;
  if (pathname === "/api/recommendations" || pathname === "/api/recommendation-regions" || /^\/api\/places(?:\/|$)/.test(pathname)) return true;
  if (method === "GET" || method === "HEAD") return false;
  if (/^\/api\/journal-entries\/[^/]+\/share-traces(?:\/[^/]+\/finalize)?$/.test(pathname)) return false;
  return pathname === "/api/recommendation-actions" || pathname === "/api/product-activity" ||
    pathname === "/api/account" || pathname === "/api/push/devices" ||
    /^\/api\/journal-(entries|books)(\/|$)/.test(pathname);
}
