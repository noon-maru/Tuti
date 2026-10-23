import { apiUrl } from "@/lib/api/apiUrl";
import { clientFetch } from "@/lib/api/clientFetch";
import { discardInvalidSession, ensureSession, fetchWithPinnedSession } from "@/lib/auth/session";
import type { ServiceTermsOffer, ServiceTermsStatus } from "@/shared/legal/serviceTerms";
import { syncLegalPolicyRelease } from "@/shared/legal/policyRelease";
import { validateFinalizedTerms } from "@/shared/legal/validateFinalizedTerms";

export const SERVICE_TERMS_REQUIRED_EVENT = "tuti:service-terms-required";
export class ServiceTermsSessionExpiredError extends Error {
  constructor() { super("로그인 정보가 만료됐어요. 확인 항목을 다시 체크한 뒤 동의해주세요. 로그인 계정은 ‘계정 관리’에서 다시 로그인할 수 있어요."); }
}

export async function fetchServiceTerms(authenticated = true): Promise<ServiceTermsStatus> {
  const response = await (authenticated ? fetchWithPinnedSession("service-terms", { cache: "no-store" }) : clientFetch(apiUrl("service-terms"), { cache: "no-store" }));
  if (!response.ok) throw new Error("이용약관을 불러오지 못했어요. 다시 시도해주세요.");
  const status = await response.json();
  validateFinalizedTerms(status);
  syncLegalPolicyRelease(status.legalPolicyRelease);
  return status;
}

export async function submitServiceTerms(offer: ServiceTermsOffer, confirmations: { ageConfirmed: boolean; importantTermsConfirmed: boolean }) {
  const session = await ensureSession();
  const response = await fetchWithPinnedSession("service-terms", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: offer.version, documentHash: offer.documentHash, accepted: true, ...confirmations }),
  }, session.userId);
  if (response.status === 401) {
    await discardInvalidSession(session);
    throw new ServiceTermsSessionExpiredError();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "동의를 저장하지 못했어요. 다시 시도해주세요.");
  }
}
