import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { privacyPolicy } from "@/shared/legal/privacyPolicy";

export const metadata: Metadata = { title: "법적 안내 | Tuti" };

export default function LegalPage() {
  return <LegalDocument {...privacyPolicy} />;
}
