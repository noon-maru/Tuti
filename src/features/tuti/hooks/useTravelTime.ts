"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTravelTime } from "@/lib/tutiApi";
import type { UserLocation } from "@/shared/tuti/types";

export function useTravelTime(
  placeId: string | undefined,
  userLocation: UserLocation | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["travel-time", placeId, Boolean(userLocation)],
    queryFn: () => fetchTravelTime(placeId!, userLocation!),
    enabled: enabled && Boolean(placeId) && Boolean(userLocation),
    staleTime: 5 * 60 * 1_000,
    retry: 1,
  });
}
