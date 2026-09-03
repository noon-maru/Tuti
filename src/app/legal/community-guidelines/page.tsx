import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { journalPublicationPolicy } from "@/shared/legal/journalPublicationPolicy";

export const metadata: Metadata = {
  title: "기록 공개 운영정책 | Tuti",
  alternates: { canonical: "/legal/community-guidelines" },
};

export default function CommunityGuidelinesPage() {
  return <LegalDocument {...journalPublicationPolicy} />;
}
