import type { Metadata } from "next";
import { LegalNoticesPage } from "@/features/legal/LegalNoticesPage";

export const metadata: Metadata = { title: "약관·정책 개정 공고 | Tuti", alternates: { canonical: "/legal/notices" } };
export default function Page() { return <LegalNoticesPage />; }
