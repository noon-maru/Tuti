"use client";

import { useCallback, useState } from "react";
import { RecommendationReadyScreen } from "@/features/tuti/screens/recommendation/RecommendationReadyScreen";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { useTutiStore } from "@/store/tuti";
import { useRouter } from "next/navigation";

export function RecommendationReadyFlow() {
  const router = useRouter();
  const finishEntry = useTutiStore((state) => state.finishEntry);
  const [recommendationRequested, setRecommendationRequested] = useState(false);
  useTutiRecommendations({ enabled: recommendationRequested });
  const beginRecommendationRequest = useCallback(() => {
    setRecommendationRequested(true);
  }, []);

  return (
    <RecommendationReadyScreen
      onRecommendationIntent={beginRecommendationRequest}
      onOpenRecommendations={() => { finishEntry(); router.replace("/explore"); }}
    />
  );
}
