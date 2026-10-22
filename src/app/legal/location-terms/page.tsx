import type { Metadata } from "next";
import { PolicyDocument } from "@/features/legal/PolicyDocument";
import { getLegalPolicyRelease } from "@/shared/legal/policyRelease";

export const metadata: Metadata = {
  title: "위치기반서비스 이용약관 | Tuti",
  alternates: { canonical: "/legal/location-terms" },
};

export default function LocationTermsPage() {
  return <PolicyDocument kind="location-terms" initialRelease={getLegalPolicyRelease()} />;
}
