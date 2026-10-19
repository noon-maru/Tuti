import type { Metadata } from "next";
import { ServiceTermsPage } from "@/features/legal/ServiceTermsPage";

export const metadata: Metadata = { title: "서비스 이용약관 | Tuti", robots: { index: false, follow: true } };
export default function Page() { return <ServiceTermsPage />; }
