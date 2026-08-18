import type { Metadata } from "next";
import { AccountDeletionRequest } from "@/features/legal/AccountDeletionRequest";

export const metadata: Metadata = {
  title: "계정 및 데이터 삭제 요청 | Tuti",
  description: "Tuti 계정과 관련 데이터의 삭제를 요청하는 공개 페이지입니다.",
};

export default function AccountDeletionPage() {
  return <AccountDeletionRequest />;
}
