"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import {
  JournalEditorScreen,
  JournalEditorStatusScreen,
} from "@/features/tuti/screens/journal/JournalEditorScreen";
import { useTutiStore } from "@/store/tuti";
import { useSession } from "@/features/tuti/hooks/useSession";

export function JournalEditFlow() {
  const router = useRouter();
  const ownerId = useSession()?.userId;
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

    router.replace("/madi");
  };
  const returnToJournalFallback = () => router.replace("/madi");

  if (isPending) {
    return (
      <JournalEditorStatusScreen
        message="마디를 불러오고 있어요."
        onBack={returnToJournalFallback}
        loading
      />
    );
  }

  if (!entry) {
    return (
      <JournalEditorStatusScreen
        message="수정할 마디를 찾지 못했어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  return (
    <JournalEditorScreen
      key={`${ownerId}:${entry.id}`} draftOwnerId={ownerId}
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
