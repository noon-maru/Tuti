"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import {
  JournalEditorScreen,
  JournalEditorStatusScreen,
} from "@/features/tuti/screens/journal/JournalEditorScreen";
import { useTutiStore } from "@/store/tuti";

export function JournalEditFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startTransition } = useJournalEntryTransition();
  const entryId = searchParams.get("entryId");
  const source = searchParams.get("source");
  const { entries, isPending, updateEntry } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const entry = entries.find((candidate) => candidate.id === entryId);
  const returnToJournal = () => router.back();
  const showJournalAfterSave = () => {
    if (source === "journal") {
      router.back();
      return;
    }

    router.replace("/journal");
  };
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
      onSubmit={async (draft, sourceElement) => {
        const updatedEntry = await updateEntry(entry.id, draft);

        setActiveJournalEntry(updatedEntry.id);
        startTransition({
          entryId: updatedEntry.id,
          image: updatedEntry.image ?? undefined,
          navigate: showJournalAfterSave,
          sourceElement,
          sourceSurface: "editor",
        });
      }}
    />
  );
}
