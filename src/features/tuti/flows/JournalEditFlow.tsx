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
import { resolveMadiEditReturn } from "@/lib/madiEditReturn";

export function JournalEditFlow() {
  const router = useRouter();
  const ownerId = useSession()?.userId;
  const searchParams = useSearchParams();
  const { startTransition } = useJournalEntryTransition();
  const entryId = searchParams.get("entryId");
  const source = searchParams.get("source");
  const bookId = searchParams.get("harumadiId");
  const { entries, isPending, isError, refetch, updateEntry } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const entry = entries.find((candidate) => candidate.id === entryId);
  const returnToJournal = () => {
    if (!entryId) { router.replace("/madi"); return; }
    const destination = resolveMadiEditReturn(ownerId, entryId, source, bookId);
    if (destination.back) router.back();
    else router.replace(destination.path);
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

  if (isError && !entry) return <JournalEditorStatusScreen
    message="수정할 마디를 불러오지 못했어요." onBack={returnToJournalFallback} onRetry={() => void refetch()} />;

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
        // 책 지면에는 마디 상세 전환의 대상 요소가 없으므로 원래 책으로 바로 복귀한다.
        if (source === "harumadi") { returnToJournal(); return; }
        startTransition({
          entryId: updatedEntry.id,
          image: updatedEntry.image ?? undefined,
          navigate: returnToJournal,
          sourceElement,
          sourceSurface: "editor",
        });
      }}
    />
  );
}
