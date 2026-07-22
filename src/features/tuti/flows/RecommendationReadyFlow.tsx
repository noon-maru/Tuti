"use client";

import { useState } from "react";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { RecommendationReadyScreen } from "@/features/tuti/screens/recommendation/RecommendationReadyScreen";
import { useTutiStore } from "@/store/tuti";

export function RecommendationReadyFlow() {
  const { userLocation } = useTutiRecommendations();
  const setUserLocation = useTutiStore((state) => state.setUserLocation);
  const finishEntry = useTutiStore((state) => state.finishEntry);
  const [resolvingLocation, setResolvingLocation] = useState(false);

  const openMain = () => {
    finishEntry();
  };

  const openRecommendations = () => {
    if (resolvingLocation) return;

    if (userLocation || !navigator.geolocation) {
      openMain();
      return;
    }

    setResolvingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setResolvingLocation(false);
        openMain();
      },
      () => {
        setResolvingLocation(false);
        openMain();
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 10,
        timeout: 6000,
      },
    );
  };

  return (
    <RecommendationReadyScreen
      onOpenRecommendations={openRecommendations}
      resolvingLocation={resolvingLocation}
    />
  );
}
