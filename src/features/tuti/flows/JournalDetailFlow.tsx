"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import {
  JournalDetailScreen,
  JournalDetailStatusScreen,
} from "@/features/tuti/screens/journal/JournalDetailScreen";
import { useTutiStore } from "@/store/tuti";

export function JournalDetailFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entryId");
  const { entries, isPending, removeEntry } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const entry = entries.find((candidate) => candidate.id === entryId);
  const returnToJournal = () => router.back();
  const returnToJournalFallback = () => router.replace("/journal");
  const deleteEntry = async () => {
    if (!entry || !window.confirm("이 기록을 삭제할까요?")) return;

    const deletedIndex = entries.findIndex(
      (candidate) => candidate.id === entry.id,
    );
    const remainingEntries = entries.filter(
      (candidate) => candidate.id !== entry.id,
    );
    const nextEntry =
      remainingEntries[
        Math.min(deletedIndex, remainingEntries.length - 1)
      ];

    try {
      await removeEntry(entry.id);
      setActiveJournalEntry(nextEntry?.id);
      router.replace("/journal");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "기록을 삭제하지 못했어요.",
      );
    }
  };

  if (isPending) {
    return (
      <JournalDetailStatusScreen
        message="지난 공간을 불러오고 있어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  if (!entry) {
    return (
      <JournalDetailStatusScreen
        message="기록을 찾지 못했어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  return (
    <JournalDetailScreen
      entry={entry}
      onBack={returnToJournal}
      onDelete={deleteEntry}
      onEdit={() =>
        router.push(
          `/journal/edit?entryId=${encodeURIComponent(entry.id)}`,
        )
      }
    />
  );
}
