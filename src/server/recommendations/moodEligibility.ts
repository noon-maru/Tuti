import type { TutiPlace } from "@/lib/recommendations";
import type { AirAnswer } from "@/shared/tuti/types";
import type { DensityAnswer } from "@/shared/tuti/types";

export function filterPlacesByRequestedMood<
  Place extends Pick<TutiPlace, "moodTags">,
>(places: readonly Place[], air: AirAnswer | undefined): Place[] {
  if (!air) return [...places];
  return places.filter((place) => place.moodTags.includes(air));
}

export function filterPlacesByRequestedDensity<
  Place extends Pick<TutiPlace, "crowd" | "crowdForecast">,
>(places: readonly Place[], density: DensityAnswer | undefined): Place[] {
  if (density !== "quiet") return [...places];

  return places.filter((place) => {
    if (place.crowdForecast) {
      return place.crowdForecast.level !== "high";
    }
    return !/혼잡|붐빔|매우\s*많/u.test(place.crowd);
  });
}
