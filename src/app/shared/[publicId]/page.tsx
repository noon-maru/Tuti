import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicJournalScreen } from "@/features/tuti/screens/journal/PublicJournalScreen";
import { getPublicJournalEntry } from "@/server/journal/publication";

export const dynamic = "force-dynamic";

type PublicJournalPageProps = {
  params: Promise<{ publicId: string }>;
};

export async function generateMetadata({
  params,
}: PublicJournalPageProps): Promise<Metadata> {
  const { publicId } = await params;
  const entry = await getPublicJournalEntry(publicId);

  if (!entry) {
    return {
      title: "공개되지 않은 기록 | Tuti",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${entry.title || entry.placeName} | Tuti`,
    description:
      entry.content.trim().slice(0, 120) ||
      `${entry.placeName}에서 남긴 Tuti 기록`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicJournalPage({
  params,
}: PublicJournalPageProps) {
  const { publicId } = await params;
  const entry = await getPublicJournalEntry(publicId);

  if (!entry) notFound();

  return <PublicJournalScreen entry={entry} />;
}
