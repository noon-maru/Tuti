import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { locationTerms } from "@/shared/location/terms";

export const metadata: Metadata = {
  title: "위치기반서비스 이용약관 | Tuti",
  alternates: { canonical: "/legal/location-terms" },
};

export default function LocationTermsPage() {
  return <LegalDocument {...locationTerms} />;
}
