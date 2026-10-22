"use client";

import { LegalDocument } from "./LegalDocument";
import { useLegalPolicyRelease } from "./useLegalPolicyRelease";
import documents from "@/shared/legal/finalizedDocuments.json";
import { legalPolicyDate, type LegalPolicyRelease } from "@/shared/legal/policyRelease";
import { privacyPolicyFrom20261010 } from "@/shared/legal/privacyPolicySecurityUpdate";
import { locationTerms } from "@/shared/location/terms";
import { journalPublicationPolicy } from "@/shared/legal/journalPublicationPolicy";

export function PolicyDocument({ kind, initialRelease = null }: { kind: "privacy" | "location-terms" | "community-guidelines"; initialRelease?: LegalPolicyRelease | null }) {
  const release = useLegalPolicyRelease(initialRelease);
  const legacy = kind === "privacy" ? privacyPolicyFrom20261010 : kind === "location-terms" ? locationTerms : journalPublicationPolicy;
  const finalized = documents[kind];
  return <LegalDocument {...(release ? {
    ...finalized.document,
    effectiveDate: legalPolicyDate(release),
    appendix: [`문서 버전: ${finalized.version}`, `문서 확인값: ${finalized.documentHash}`],
  } : legacy)} />;
}
