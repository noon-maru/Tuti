import documents from "@/shared/legal/finalizedDocuments.json";
import { getLegalPolicyRelease, legalPolicyDate } from "@/shared/legal/policyRelease";

export const LOCATION_TERMS_VERSION = documents["location-terms"].version;
export function getLocationTermsVersion() { return LOCATION_TERMS_VERSION; }

export const locationTerms = {
  ...documents["location-terms"].document,
  effectiveDate: "시행일 확인 중",
  provider: {
    businessName: "눈마루", serviceName: "Tuti", representative: "정연한",
    address: "서울특별시 영등포구 선유서로34길 11-2, 604호",
    phone: "010-2724-4307", email: "admin@tuti.today", locationManager: "정연한(대표)",
  },
  appendix: [`약관 버전: ${LOCATION_TERMS_VERSION}`],
};

export function getLocationTerms() {
  const release = getLegalPolicyRelease();
  return { ...locationTerms, effectiveDate: release ? legalPolicyDate(release) : "시행일 확인 중" };
}
