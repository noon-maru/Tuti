"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDeparturePlan } from "@/lib/tutiApi";
import type { TransportAnswer, UserLocation } from "@/shared/tuti/types";

export function useDeparturePlan(
  placeId: string,
  userLocation?: UserLocation,
  transport?: TransportAnswer,
) {
  return useQuery({
    queryKey: departurePlanQueryKey(placeId, userLocation, transport),
    queryFn: () => fetchDeparturePlan(placeId, userLocation!, transport),
    enabled: Boolean(userLocation),
    staleTime: 5 * 60 * 1_000,
    retry: 1,
  });
}

export function departurePlanQueryKey(
  placeId: string,
  userLocation?: UserLocation,
  transport?: TransportAnswer,
) {
  return [
    "departure-plan",
    placeId,
    userLocation?.latitude ?? null,
    userLocation?.longitude ?? null,
    transport ?? null,
  ] as const;
}
