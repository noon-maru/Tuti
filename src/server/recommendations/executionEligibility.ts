import type { TutiPlace } from "@/lib/recommendations";

export function excludeExplicitlyInfeasiblePlaces<
  Place extends Pick<TutiPlace, "executionFeasibility">,
>(places: readonly Place[]): Place[] {
  return places.filter(
    (place) => place.executionFeasibility?.fitsAvailableTime !== false,
  );
}
