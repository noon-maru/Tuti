import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DownloadPage } from "@/features/download/DownloadPage";

export const metadata: Metadata = {
  title: "Tuti 앱 다운로드",
  description:
    "반려동물과 함께한 순간도, 나만의 하루도. iPhone과 Android에서 Tuti로 일상을 남기고 하루마디로 모아보세요.",
  alternates: { canonical: "/download" },
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_TUTI_TARGET === "app") {
    notFound();
  }

  return <DownloadPage />;
}
