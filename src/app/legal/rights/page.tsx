import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { rightsContactNotice } from "@/shared/legal/rightsContact";

export const metadata: Metadata = {
  title: "권리 침해 신고 안내 | Tuti",
  alternates: { canonical: "/legal/rights" },
};

export default function RightsContactPage() {
  return <LegalDocument {...rightsContactNotice} documentNavigation={<>
    <a href="mailto:admin@tuti.today">이메일로 접수하기</a>
    <a href="https://www.law.go.kr/법령/저작권법시행규칙" target="_blank" rel="noopener noreferrer">현행 법정 서식 확인하기</a>
  </>} />;
}
