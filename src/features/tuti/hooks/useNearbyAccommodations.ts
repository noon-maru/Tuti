"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchNearbyAccommodations } from "@/lib/tutiApi";

export function useNearbyAccommodations(placeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["nearby-accommodations", placeId],
    queryFn: () => fetchNearbyAccommodations(placeId),
    enabled: Boolean(placeId) && enabled,
    staleTime: 6 * 60 * 60 * 1_000,
    retry: 1,
  });
}
