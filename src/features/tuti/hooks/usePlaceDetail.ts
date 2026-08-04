"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPlaceDetail } from "@/lib/tutiApi";

export function usePlaceDetail(placeId: string, enabled = true) {
  return useQuery({
    queryKey: ["place-detail", placeId],
    queryFn: () => fetchPlaceDetail(placeId),
    enabled,
    staleTime: 30 * 60 * 1_000,
    retry: 1,
  });
}
