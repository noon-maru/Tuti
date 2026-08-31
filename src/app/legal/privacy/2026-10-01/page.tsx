import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { upcomingPrivacyPolicy } from "@/shared/legal/privacyPolicyUpdate";

export const metadata: Metadata = {
  title: "개인정보 처리방침 개정안 | Tuti",
};

export default function UpcomingPrivacyPolicyPage() {
  return <LegalDocument {...upcomingPrivacyPolicy} />;
}
