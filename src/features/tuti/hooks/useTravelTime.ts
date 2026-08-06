"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTravelTime } from "@/lib/tutiApi";
import type { TravelTimeSummary } from "@/shared/api/travelTime";
import type { UserLocation } from "@/shared/tuti/types";

export function useTravelTime(
  placeId: string | undefined,
  userLocation: UserLocation | undefined,
  enabled = true,
  initialData?: TravelTimeSummary,
) {
  return useQuery({
    queryKey: [
      "travel-time",
      placeId,
      userLocation?.latitude,
      userLocation?.longitude,
    ],
    queryFn: () => fetchTravelTime(placeId!, userLocation!),
    enabled: enabled && Boolean(placeId) && Boolean(userLocation),
    initialData,
    staleTime: 5 * 60 * 1_000,
    retry: 1,
  });
}
