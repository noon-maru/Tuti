import type { TutiPlace } from "@/lib/recommendations";
import type { AirAnswer } from "@/shared/tuti/types";
import type { DensityAnswer } from "@/shared/tuti/types";

export function filterPlacesByRequestedMood<
  Place extends Pick<TutiPlace, "moodTags">,
>(places: readonly Place[], air: AirAnswer | undefined): Place[] {
  if (!air) return [...places];
  return places.filter((place) => place.moodTags.includes(air));
}

export function prioritizePlacesByRequestedMood<
  Place extends Pick<TutiPlace, "moodTags">,
>(places: readonly Place[], air: AirAnswer | undefined): Place[] {
  if (!air) return [...places];

  const matched: Place[] = [];
  const fallback: Place[] = [];
  for (const place of places) {
    (place.moodTags.includes(air) ? matched : fallback).push(place);
  }

  return [...matched, ...fallback];
}

export function filterPlacesByRequestedDensity<
  Place extends Pick<TutiPlace, "crowd" | "crowdForecast">,
>(places: readonly Place[], density: DensityAnswer | undefined): Place[] {
  if (density !== "quiet") return [...places];

  return places.filter((place) => {
    if (place.crowdForecast) {
      if (place.crowdForecast.level !== "high") return true;

      // 실시간·관광지 직접 관측은 한적함 요청의 강한 제약으로 사용한다.
      // 지역 방문 패턴 기반 추정치는 넓은 지역의 모든 장소가 같은 값이 될 수
      // 있으므로 후보를 전부 없애지 않고 후속 피로도 점수에서 감점한다.
      return (
        place.crowdForecast.provider !== "seoul_citydata" &&
        place.crowdForecast.provider !== "kto_concentration"
      );
    }
    return !/혼잡|붐빔|매우\s*많/u.test(place.crowd);
  });
}
