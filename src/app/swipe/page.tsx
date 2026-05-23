"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TutiRoute } from "@/features/tuti/components/TutiRoute";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { SwipeScreen } from "@/features/tuti/screens/swipe/SwipeScreen";
import { useTutiStore } from "@/store/tuti";

export default function SwipeRoute() {
  return (
    <TutiRoute>
      <SwipeFlow />
    </TutiRoute>
  );
}

function SwipeFlow() {
  const router = useRouter();
  const { places } = useTutiRecommendations();
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const setActiveIndex = useTutiStore((state) => state.setActiveIndex);
  const moveActiveIndex = useTutiStore((state) => state.moveActiveIndex);
  const [gestureStart, setGestureStart] = useState<{ x: number; y: number } | null>(null);

  const activePlace = places[activeIndex] ?? places[0];

  const moveCard = (direction: number) => {
    moveActiveIndex(direction, places.length);
  };

  const finishGesture = ({ x, y }: { x: number; y: number }) => {
    if (!gestureStart) return;

    const dx = x - gestureStart.x;
    const dy = y - gestureStart.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);

    if (horizontal && Math.abs(dx) > 36) {
      moveCard(dx < 0 ? 1 : -1);
    }

    if (!horizontal && Math.abs(dy) > 48) {
      router.push(dy < 0 ? "/detail" : "/journal");
    }

    setGestureStart(null);
  };

  return (
    <SwipeScreen
      places={places}
      activeIndex={activeIndex}
      activePlace={activePlace}
      onSelect={setActiveIndex}
      onMove={moveCard}
      onDetail={() => router.push("/detail")}
      onGestureStart={setGestureStart}
      onGestureEnd={finishGesture}
    />
  );
}
