import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { privacyPolicy } from "@/shared/legal/privacyPolicy";

export const metadata: Metadata = { title: "개인정보 처리방침 | Tuti" };

export default function PrivacyPolicyPage() {
  return <LegalDocument {...privacyPolicy} />;
}
