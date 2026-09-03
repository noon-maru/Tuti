import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { privacyPolicy } from "@/shared/legal/privacyPolicy";
import {
  PRIVACY_POLICY_UPDATE_EFFECTIVE_AT,
  PRIVACY_POLICY_UPDATE_PATH,
} from "@/shared/legal/privacyPolicyUpdate";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | Tuti",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      {...privacyPolicy}
      announcement={{
        title: "개인정보 처리방침 개정 안내",
        description: `${PRIVACY_POLICY_UPDATE_EFFECTIVE_AT}부터 문의 답변 푸시 알림과 기록 인터넷 공개에 관한 처리 내용이 추가됩니다. 시행 전까지는 현재 방침이 적용됩니다.`,
        href: PRIVACY_POLICY_UPDATE_PATH,
        linkLabel: "개정안 확인하기",
      }}
    />
  );
}
