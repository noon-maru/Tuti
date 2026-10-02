"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTravelTime } from "@/lib/tutiApi";
import type { TravelTimeSummary } from "@/shared/api/travelTime";
import type { TransportAnswer, UserLocation } from "@/shared/tuti/types";

export function useTravelTime(
  placeId: string | undefined,
  userLocation: UserLocation | undefined,
  enabled = true,
  initialData?: TravelTimeSummary,
  transport?: TransportAnswer,
) {
  return useQuery({
    queryKey: [
      "travel-time",
      placeId,
      userLocation?.latitude,
      userLocation?.longitude,
      transport,
    ],
    queryFn: () => fetchTravelTime(placeId!, userLocation!, transport),
    enabled: enabled && Boolean(placeId) && Boolean(userLocation),
    initialData,
    staleTime: 5 * 60 * 1_000,
    retry: 1,
  });
}
