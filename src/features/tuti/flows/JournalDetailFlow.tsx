"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import {
  JournalDetailScreen,
  JournalDetailStatusScreen,
} from "@/features/tuti/screens/journal/JournalDetailScreen";

export function JournalDetailFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entryId");
  const { entries, isPending } = useTutiJournalEntries();
  const entry = entries.find((candidate) => candidate.id === entryId);
  const returnToJournal = () => router.replace("/journal");

  if (isPending) {
    return (
      <JournalDetailStatusScreen
        message="지난 공간을 불러오고 있어요."
        onBack={returnToJournal}
      />
    );
  }

  if (!entry) {
    return (
      <JournalDetailStatusScreen
        message="기록을 찾지 못했어요."
        onBack={returnToJournal}
      />
    );
  }

  return <JournalDetailScreen entry={entry} onBack={returnToJournal} />;
}
