import type { Metadata } from "next";
import { EffectivePrivacyPolicyDocument } from "@/features/legal/EffectivePrivacyPolicyDocument";

export const metadata: Metadata = {
  title: "법적 안내 | Tuti",
  alternates: { canonical: "/legal/privacy" },
};

export default function LegalPage() {
  return <EffectivePrivacyPolicyDocument />;
}
