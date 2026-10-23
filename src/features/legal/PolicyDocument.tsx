"use client";

import { LegalDocument } from "./LegalDocument";
import { useLegalPolicyRelease } from "./useLegalPolicyRelease";
import documents from "@/shared/legal/finalizedDocuments.json";
import { legalPolicyDate, type LegalPolicyRelease } from "@/shared/legal/policyRelease";

export function PolicyDocument({ kind, initialRelease = null }: { kind: "privacy" | "location-terms" | "community-guidelines"; initialRelease?: LegalPolicyRelease | null }) {
  const release = useLegalPolicyRelease(initialRelease);
  const finalized = documents[kind];
  return <LegalDocument {...{
    ...finalized.document,
    effectiveDate: release ? legalPolicyDate(release) : "시행일 확인 중",
    appendix: [`문서 버전: ${finalized.version}`, `문서 확인값: ${finalized.documentHash}`],
  }} />;
}
