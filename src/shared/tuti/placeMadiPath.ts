/** Explicit place action only. This fills a draft; it never creates a visit or madi. */
export function placeMadiPath(place: { id: string; name: string }, journeyId?: string | null) {
  const params = new URLSearchParams({ from: "explore", placeId: place.id, placeName: place.name });
  if (journeyId) params.set("journeyId", journeyId);
  return `/madi/new?${params}`;
}
