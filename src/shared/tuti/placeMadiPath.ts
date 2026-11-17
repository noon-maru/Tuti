/** Explicit place action only. This fills a draft; it never creates a visit or madi. */
export function placeMadiPath(place: { id: string; name: string }, journeyId?: string | null, harumadiId?: string | null) {
  const params = new URLSearchParams({ from: "explore", placeId: place.id, placeName: place.name });
  if (journeyId) params.set("journeyId", journeyId);
  if (harumadiId) params.set("harumadiId", harumadiId);
  return `/madi/new?${params}`;
}

export function savedDepartureDestination(saved: { ownerId?: string; harumadiId?: string }, ownerId?: string) {
  return ownerId && saved.ownerId === ownerId ? saved.harumadiId ?? null : null;
}
