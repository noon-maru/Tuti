"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import {
  JournalEditorScreen,
  JournalEditorStatusScreen,
} from "@/features/tuti/screens/journal/JournalEditorScreen";

export function JournalEditFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entryId");
  const { entries, isPending, updateEntry } = useTutiJournalEntries();
  const entry = entries.find((candidate) => candidate.id === entryId);
  const returnToJournal = () => router.back();
  const returnToJournalFallback = () => router.replace("/journal");

  if (isPending) {
    return (
      <JournalEditorStatusScreen
        message="기록을 불러오고 있어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  if (!entry) {
    return (
      <JournalEditorStatusScreen
        message="수정할 기록을 찾지 못했어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  return (
    <JournalEditorScreen
      entry={entry}
      onBack={returnToJournal}
      onSubmit={async (draft) => {
        await updateEntry(entry.id, draft);
        returnToJournal();
      }}
    />
  );
}
