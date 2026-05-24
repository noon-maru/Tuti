"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { SwipeScreen } from "@/features/tuti/screens/swipe/SwipeScreen";
import { useTutiStore } from "@/store/tuti";

export default function SwipeRoute() {
  return <SwipeFlow />;
}

function SwipeFlow() {
  const router = useRouter();
  const { places } = useTutiRecommendations();
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const setActiveIndex = useTutiStore((state) => state.setActiveIndex);
  const moveActiveIndex = useTutiStore((state) => state.moveActiveIndex);

  const activePlace = places[activeIndex] ?? places[0];

  useEffect(() => {
    router.prefetch("/detail");
    router.prefetch("/journal");
  }, [router]);

  const moveCard = (direction: number) => {
    moveActiveIndex(direction, places.length);
  };

  return (
    <SwipeScreen
      places={places}
      activeIndex={activeIndex}
      activePlace={activePlace}
      onSelect={setActiveIndex}
      onMove={moveCard}
      onDetail={() => router.push("/detail")}
      onJournal={() => router.push("/journal")}
    />
  );
}
