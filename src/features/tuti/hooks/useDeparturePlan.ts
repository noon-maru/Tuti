"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDeparturePlan } from "@/lib/tutiApi";
import type { UserLocation } from "@/shared/tuti/types";

export function useDeparturePlan(
  placeId: string,
  userLocation?: UserLocation,
) {
  return useQuery({
    queryKey: departurePlanQueryKey(placeId, userLocation),
    queryFn: () => fetchDeparturePlan(placeId, userLocation!),
    enabled: Boolean(userLocation),
    staleTime: 5 * 60 * 1_000,
    retry: 1,
  });
}

export function departurePlanQueryKey(
  placeId: string,
  userLocation?: UserLocation,
) {
  return [
    "departure-plan",
    placeId,
    userLocation?.latitude.toFixed(4),
    userLocation?.longitude.toFixed(4),
  ] as const;
}
