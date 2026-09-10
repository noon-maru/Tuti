import type { Metadata } from "next";
import { EffectivePrivacyPolicyDocument } from "@/features/legal/EffectivePrivacyPolicyDocument";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | Tuti",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPolicyPage() {
  return <EffectivePrivacyPolicyDocument />;
}
