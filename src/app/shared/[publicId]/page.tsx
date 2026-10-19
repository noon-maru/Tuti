import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicJournalFlow } from "@/features/tuti/flows/PublicJournalFlow";
import { getPublicJournalAccessState } from "@/server/journal/publication";

export const dynamic = "force-dynamic";

type PublicJournalPageProps = {
  params: Promise<{ publicId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "공유된 지난 공간 | Tuti",
    description: "Tuti에서 공유된 지난 공간 기록입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function PublicJournalPage({
  params,
}: PublicJournalPageProps) {
  const { publicId } = await params;
  const state = await getPublicJournalAccessState(publicId);
  if (state === "unavailable") notFound();
  if (state === "rights_blocked") return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
    <section style={{ maxWidth: 420, padding: 28, borderRadius: 16, background: "#fff" }}>
      <h1 style={{ fontSize: 20, lineHeight: 1.5 }}>공개가 제한된 기록이에요</h1>
      <p style={{ lineHeight: 1.8 }}>권리 보호 절차에 따라 이 기록의 공개가 제한되어 있어요. 기록의 내용과 사진은 표시되지 않아요.</p>
      <a href="mailto:admin@tuti.today">조치에 관해 문의하기</a>
    </section>
  </main>;
  return <PublicJournalFlow publicId={publicId} />;
}
