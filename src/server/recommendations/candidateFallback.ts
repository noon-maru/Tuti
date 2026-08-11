export function selectRecommendationCandidatePool<Place extends { id: string }>(
  places: Place[],
  excludePlaceIds: string[],
  minimumCandidateCount = 6,
) {
  const excludedPlaceIdSet = new Set(excludePlaceIds);
  const eligiblePlaces = places.filter(
    (place) => !excludedPlaceIdSet.has(place.id),
  );

  return {
    eligiblePlaces,
    candidatePlaces:
      eligiblePlaces.length >= minimumCandidateCount
        ? eligiblePlaces
        : places,
  };
}
