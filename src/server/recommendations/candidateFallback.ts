export function selectRecommendationCandidatePool<Place extends { id: string }>(
  places: Place[],
  excludePlaceIds: string[],
) {
  const excludedPlaceIdSet = new Set(excludePlaceIds);
  const eligiblePlaces = places.filter(
    (place) => !excludedPlaceIdSet.has(place.id),
  );

  return {
    eligiblePlaces,
    candidatePlaces: eligiblePlaces,
    fallbackPlaces: places.filter((place) => excludedPlaceIdSet.has(place.id)),
  };
}
