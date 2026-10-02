"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDepartureNearbyPlaces } from "@/lib/tutiApi";

export function useDepartureNearbyPlaces(placeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["departure-nearby", placeId],
    queryFn: () => fetchDepartureNearbyPlaces(placeId),
    enabled: enabled && Boolean(placeId),
    staleTime: 6 * 60 * 60 * 1_000,
    retry: 1,
  });
}
