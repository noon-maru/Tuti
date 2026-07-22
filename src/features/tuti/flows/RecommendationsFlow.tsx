"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { RecommendationsScreen } from "@/features/tuti/screens/recommendations/RecommendationsScreen";
import { useTutiStore } from "@/store/tuti";

export function RecommendationsFlow() {
  const router = useRouter();
  const { places } = useTutiRecommendations();
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const hasSeenSwipeHelp = useTutiStore((state) => state.hasSeenSwipeHelp);
  const hasSeenJournalHelp = useTutiStore((state) => state.hasSeenJournalHelp);
  const setActiveIndex = useTutiStore((state) => state.setActiveIndex);
  const moveActiveIndex = useTutiStore((state) => state.moveActiveIndex);
  const markSwipeHelpSeen = useTutiStore((state) => state.markSwipeHelpSeen);
  const markJournalHelpSeen = useTutiStore((state) => state.markJournalHelpSeen);

  const activePlace = places[activeIndex] ?? places[0];

  useEffect(() => {
    router.prefetch("/detail");
    router.prefetch("/journal");
  }, [router]);

  const moveCard = (direction: number) => {
    moveActiveIndex(direction, places.length);
  };

  return (
    <RecommendationsScreen
      places={places}
      activeIndex={activeIndex}
      activePlace={activePlace}
      onSelect={setActiveIndex}
      onMove={moveCard}
      onDetail={() => router.push("/detail")}
      onJournal={() => router.push("/journal")}
      initialHelp={
        !hasSeenSwipeHelp ? "detail" : !hasSeenJournalHelp ? "journal" : null
      }
      onInitialHelpShown={(kind) => {
        if (kind === "detail") {
          markSwipeHelpSeen();
          return;
        }

        markJournalHelpSeen();
      }}
    />
  );
}
