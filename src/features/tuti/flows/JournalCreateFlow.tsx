"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { JournalEditorScreen } from "@/features/tuti/screens/journal/JournalEditorScreen";
import { recordRecommendationAction } from "@/lib/tutiApi";
import { useTutiStore } from "@/store/tuti";

export function JournalCreateFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startTransition } = useJournalEntryTransition();
  const { addEntry } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const returnToJournal = () => router.back();
  const initialPlaceId = searchParams.get("placeId");
  const initialPlaceName = searchParams.get("placeName");
  const recommendationId = searchParams.get("journeyId");

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
