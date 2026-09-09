import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DownloadPage } from "@/features/download/DownloadPage";

export const metadata: Metadata = {
  title: "Tuti 앱 다운로드",
  description:
    "iPhone과 Android에서 Tuti를 설치하고 오늘 가능한 만큼만 잠깐 다른 공기를 만나보세요.",
  alternates: { canonical: "/download" },
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_TUTI_TARGET === "app") {
    notFound();
  }

  return <DownloadPage />;
}
