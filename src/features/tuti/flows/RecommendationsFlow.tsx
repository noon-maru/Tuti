"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { RecommendationsScreen } from "@/features/tuti/screens/recommendations/RecommendationsScreen";
import { useTutiStore } from "@/store/tuti";

export function RecommendationsFlow({ interactive }: { interactive: boolean }) {
  const router = useRouter();
  const { places, isFetched } = useTutiRecommendations();
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const activePlaceId = useTutiStore((state) => state.activePlaceId);
  const detailOverlay = useTutiStore((state) => state.detailOverlay);
  const hasSeenSwipeHelp = useTutiStore((state) => state.hasSeenSwipeHelp);
  const hasSeenJournalHelp = useTutiStore((state) => state.hasSeenJournalHelp);
  const setActivePlace = useTutiStore((state) => state.setActivePlace);
  const openDetailOverlay = useTutiStore((state) => state.openDetail);
  const beginDetailClose = useTutiStore((state) => state.beginDetailClose);
  const finishDetailClose = useTutiStore((state) => state.finishDetailClose);
  const markSwipeHelpSeen = useTutiStore((state) => state.markSwipeHelpSeen);
  const markJournalHelpSeen = useTutiStore((state) => state.markJournalHelpSeen);

  const detailPlaceIndex =
    detailOverlay.placeId
      ? places.findIndex((place) => place.id === detailOverlay.placeId)
      : -1;
  const restoredActiveIndex = activePlaceId
    ? places.findIndex((place) => place.id === activePlaceId)
    : -1;
  const displayedActiveIndex =
    detailOverlay.phase === "open" && detailPlaceIndex >= 0
      ? detailPlaceIndex
      : restoredActiveIndex >= 0
        ? restoredActiveIndex
        : Math.min(activeIndex, Math.max(places.length - 1, 0));
  const activePlace = places[displayedActiveIndex] ?? places[0];
  const detailPlace = detailOverlay.placeId
    ? places.find((place) => place.id === detailOverlay.placeId)
    : undefined;

  useEffect(() => {
    router.prefetch("/journal");
  }, [router]);

  useEffect(() => {
    if (!isFetched) {
      return;
    }

    let targetPlaceId = activePlaceId;
    let targetIndex = restoredActiveIndex;

    if (detailOverlay.phase === "open" && detailOverlay.placeId) {
      if (detailPlaceIndex >= 0) {
        targetPlaceId = detailOverlay.placeId;
        targetIndex = detailPlaceIndex;
      } else {
        finishDetailClose();
      }
    }

    if (targetPlaceId && targetIndex >= 0) {
      if (activeIndex !== targetIndex || activePlaceId !== targetPlaceId) {
        setActivePlace(targetIndex, targetPlaceId);
      }
      return;
    }

    const fallbackPlace = places[0];

    if (
      fallbackPlace &&
      (activeIndex !== 0 || activePlaceId !== fallbackPlace.id)
    ) {
      setActivePlace(0, fallbackPlace.id);
    }
  }, [
    activeIndex,
    activePlaceId,
    detailPlaceIndex,
    detailOverlay.phase,
    detailOverlay.placeId,
    finishDetailClose,
    isFetched,
    places,
    restoredActiveIndex,
    setActivePlace,
  ]);

  const moveCard = (direction: number) => {
    if (!places.length) {
      return;
    }

    const nextIndex =
      (displayedActiveIndex + direction + places.length) % places.length;
    const nextPlace = places[nextIndex];

    setActivePlace(nextIndex, nextPlace.id);
  };

  const selectCard = (index: number) => {
    const place = places[index];

    if (!place) {
      return;
    }

    setActivePlace(index, place.id);
  };

  const openDetail = () => {
    if (!activePlace || detailOverlay.phase !== "closed") {
      return;
    }

    openDetailOverlay(activePlace.id);
  };

  return (
    <RecommendationsScreen
      places={places}
      activeIndex={displayedActiveIndex}
      activePlace={activePlace}
      onSelect={selectCard}
      onMove={moveCard}
      detailPhase={detailOverlay.phase}
      detailPlace={detailPlace}
      onDetail={openDetail}
      onDetailExitStart={beginDetailClose}
      onDetailClose={finishDetailClose}
      onJournal={() => router.push("/journal")}
      interactive={interactive}
      initialHelp={
        interactive && detailOverlay.phase === "closed"
          ? !hasSeenSwipeHelp
            ? "detail"
            : !hasSeenJournalHelp
              ? "journal"
              : null
          : null
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
