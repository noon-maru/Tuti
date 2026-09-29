"use client";

import { RecommendationReadyScreen } from "@/features/tuti/screens/recommendation/RecommendationReadyScreen";
import { useTutiStore } from "@/store/tuti";

export function RecommendationReadyFlow() {
  const finishEntry = useTutiStore((state) => state.finishEntry);

  return <RecommendationReadyScreen onOpenRecommendations={finishEntry} />;
}
