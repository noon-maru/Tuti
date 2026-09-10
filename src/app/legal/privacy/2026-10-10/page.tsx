import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { upcomingPrivacySecurityPolicy } from "@/shared/legal/privacyPolicySecurityUpdate";

export const metadata: Metadata = {
  title: "개인정보 처리방침 개정안 | Tuti",
  robots: { index: false, follow: true },
};

export default function UpcomingPrivacySecurityPolicyPage() {
  return <LegalDocument {...upcomingPrivacySecurityPolicy} />;
}
