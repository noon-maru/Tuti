import type { Metadata } from "next";
import { AccountDeletionRequest } from "@/features/legal/AccountDeletionRequest";

export const metadata: Metadata = {
  title: "계정 및 데이터 삭제 안내 | Tuti",
  description:
    "Tuti 앱에서 계정과 데이터를 즉시 삭제하는 방법과 앱에 접근할 수 없을 때의 지원 요청 방법을 안내합니다.",
  alternates: { canonical: "/account-deletion" },
};

export default function AccountDeletionPage() {
  return <AccountDeletionRequest />;
}
