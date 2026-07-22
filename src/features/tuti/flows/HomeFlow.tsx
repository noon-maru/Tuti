"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { HomeScreen } from "@/features/tuti/screens/home/HomeScreen";
import { useTutiStore } from "@/store/tuti";

export function HomeFlow() {
  const router = useRouter();
  const { feature, places, userLocation } = useTutiRecommendations();
  const setUserLocation = useTutiStore((state) => state.setUserLocation);
  const [requestingLocation, setRequestingLocation] = useState(false);

  const enterSwipe = () => {
    if (requestingLocation) return;

    if (userLocation || !navigator.geolocation) {
      router.push("/swipe");
      return;
    }

    setRequestingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setRequestingLocation(false);
        router.push("/swipe");
      },
      () => {
        setRequestingLocation(false);
        router.push("/swipe");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 10,
        timeout: 6000,
      },
    );
  };

  return (
    <HomeScreen
      place={places[0]}
      feature={feature}
      onEnterSwipe={enterSwipe}
      requestingLocation={requestingLocation}
    />
  );
}
