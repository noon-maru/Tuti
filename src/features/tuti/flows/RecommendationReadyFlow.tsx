"use client";

import { useState } from "react";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import { RecommendationReadyScreen } from "@/features/tuti/screens/recommendation/RecommendationReadyScreen";
import { useTutiStore } from "@/store/tuti";

export function RecommendationReadyFlow() {
  const { requestLocation } = useLocationAccess();
  const finishEntry = useTutiStore((state) => state.finishEntry);
  const [resolvingLocation, setResolvingLocation] = useState(false);

  const openMain = () => {
    finishEntry();
  };

  const openRecommendations = async () => {
    if (resolvingLocation) return;

    setResolvingLocation(true);

    try {
      await requestLocation();
      openMain();
    } finally {
      setResolvingLocation(false);
    }
  };

  return (
    <RecommendationReadyScreen
      onOpenRecommendations={openRecommendations}
      resolvingLocation={resolvingLocation}
    />
  );
}
