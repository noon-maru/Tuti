import type { Metadata } from "next";
import { PolicyDocument } from "@/features/legal/PolicyDocument";
import { getLegalPolicyRelease } from "@/shared/legal/policyRelease";

export const metadata: Metadata = {
  title: "기록 공개 운영정책 | Tuti",
  alternates: { canonical: "/legal/community-guidelines" },
};

export default function CommunityGuidelinesPage() {
  return <PolicyDocument kind="community-guidelines" initialRelease={getLegalPolicyRelease()} />;
}
