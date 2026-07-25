"use client";

import { useRouter } from "next/navigation";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { JournalEditorScreen } from "@/features/tuti/screens/journal/JournalEditorScreen";
import { useTutiStore } from "@/store/tuti";

export function JournalCreateFlow() {
  const router = useRouter();
  const { startTransition } = useJournalEntryTransition();
  const { addEntry } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const returnToJournal = () => router.back();

  return (
    <JournalEditorScreen
      onBack={returnToJournal}
      onSubmit={async (draft, sourceElement) => {
        const entry = await addEntry(draft);

        setActiveJournalEntry(entry.id);
        startTransition({
          entryId: entry.id,
          image: entry.image ?? undefined,
          navigate: returnToJournal,
          sourceElement,
          sourceSurface: "editor",
        });
      }}
    />
  );
}
