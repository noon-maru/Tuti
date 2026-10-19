import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import { JournalRightsScreen } from "@/features/admin/JournalRightsScreen";

export const metadata: Metadata = { title: "공개 기록 권리 보호 | Tuti 관리자", robots: { index: false, follow: false } };
export default function JournalRightsPage() {
  return <Providers><JournalRightsScreen /></Providers>;
}
