"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchServiceTerms } from "@/lib/serviceTerms";
import { getClientLegalPolicyRelease, subscribeLegalPolicyRelease, type LegalPolicyRelease } from "@/shared/legal/policyRelease";

export function useLegalPolicyRelease(initialRelease: LegalPolicyRelease | null = null) {
  const release = useSyncExternalStore(subscribeLegalPolicyRelease,
    () => getClientLegalPolicyRelease() === undefined ? initialRelease : getClientLegalPolicyRelease() ?? null,
    () => initialRelease);
  useEffect(() => { void fetchServiceTerms(false).catch(() => {}); }, []);
  return release;
}
