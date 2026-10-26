"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { requestLoginNudge } from "@/features/tuti/auth/loginNudge";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { JournalEditorScreen } from "@/features/tuti/screens/journal/JournalEditorScreen";
import { FirstMemoryScreen } from "@/features/tuti/screens/onboarding/FirstMemoryScreen";
import { recordRecommendationAction } from "@/lib/tutiApi";
import { useTutiStore } from "@/store/tuti";
import { notebookPath } from "@/lib/journalNotebooks";
import { useRef } from "react";

export function JournalCreateFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notebookId = searchParams.get("notebookId");
  const savedEntryId = useRef<string | null>(null);
  const { startTransition } = useJournalEntryTransition();
  const { addEntry } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const fromWelcome = ["welcome", "library"].includes(searchParams.get("from") ?? "");
  const returnToJournal = () => router.back();
  const initialPlaceId = searchParams.get("placeId");
  const initialPlaceName = searchParams.get("placeName");
  const recommendationId = searchParams.get("journeyId");

  if (fromWelcome) return <FirstMemoryScreen
    inNotebook={Boolean(notebookId)}
    onBack={() => router.replace(notebookId ? notebookPath(notebookId) : searchParams.get("from") === "library" ? "/" : "/entry")}
    onSave={addEntry}
    onSaved={(entry) => { savedEntryId.current = entry.id; setActiveJournalEntry(entry.id); }}
    onCollection={() => router.replace(notebookId ? `${notebookPath(notebookId)}${savedEntryId.current ? `&addEntryId=${encodeURIComponent(savedEntryId.current)}` : ""}` : "/")}
  />;

  return (
    <JournalEditorScreen
      initialPlace={
        initialPlaceId && initialPlaceName
          ? { id: initialPlaceId, name: initialPlaceName }
          : undefined
      }
      onBack={returnToJournal}
      onSubmit={async (draft, sourceElement) => {
        const entry = await addEntry(draft);
        requestLoginNudge("journal_created");

        if (recommendationId) {
          void recordRecommendationAction({
            journeyId: recommendationId,
            action: "journal_created",
            placeId: entry.placeId ?? undefined,
            metadata: { entryId: entry.id },
          }).catch((error) => {
            console.warn("기록 작성 행동을 저장하지 못했습니다.", error);
          });
        }

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
