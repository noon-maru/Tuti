import type { TutiPlace } from "@/lib/recommendations";
import type { AirAnswer } from "@/shared/tuti/types";

export function filterPlacesByRequestedMood<
  Place extends Pick<TutiPlace, "moodTags">,
>(places: readonly Place[], air: AirAnswer | undefined): Place[] {
  if (!air) return [...places];
  return places.filter((place) => place.moodTags.includes(air));
}
