import { apiUrl } from "@/lib/api/apiUrl";
import { fetchWithPinnedSession } from "@/lib/auth/session";
import type { ServiceTermsOffer, ServiceTermsStatus } from "@/shared/legal/serviceTerms";

export const SERVICE_TERMS_REQUIRED_EVENT = "tuti:service-terms-required";

export async function fetchServiceTerms(authenticated = true): Promise<ServiceTermsStatus> {
  const response = await (authenticated ? fetchWithPinnedSession("service-terms", { cache: "no-store" }) : fetch(apiUrl("service-terms"), { cache: "no-store" }));
  if (!response.ok) throw new Error("이용약관을 불러오지 못했어요. 다시 시도해주세요.");
  return response.json();
}

export async function submitServiceTerms(offer: ServiceTermsOffer, confirmations: { ageConfirmed: boolean; importantTermsConfirmed: boolean }) {
  const response = await fetchWithPinnedSession("service-terms", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: offer.version, documentHash: offer.documentHash, accepted: true, ...confirmations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "동의를 저장하지 못했어요. 다시 시도해주세요.");
  }
}
