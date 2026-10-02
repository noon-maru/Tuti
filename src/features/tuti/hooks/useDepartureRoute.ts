"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDepartureRoute } from "@/lib/tutiApi";
import type { DepartureRouteMode } from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

export function useDepartureRoute(
  placeId: string,
  userLocation: UserLocation | undefined,
  mode: DepartureRouteMode | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      "departure-route",
      placeId,
      userLocation?.latitude ?? null,
      userLocation?.longitude ?? null,
      mode,
    ],
    queryFn: () => fetchDepartureRoute(placeId, userLocation!, mode!),
    enabled: enabled && Boolean(placeId) && Boolean(userLocation) && Boolean(mode),
    staleTime: 5 * 60 * 1_000,
    retry: 1,
  });
}
