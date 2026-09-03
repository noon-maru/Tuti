import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicJournalFlow } from "@/features/tuti/flows/PublicJournalFlow";
import { isPublicJournalEntryAvailable } from "@/server/journal/publication";

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
  if (!(await isPublicJournalEntryAvailable(publicId))) notFound();
  return <PublicJournalFlow publicId={publicId} />;
}
