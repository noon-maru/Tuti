/** Persist only the completed task's identifier, not another copy of private content. */
export function publicPlaceReturnPath(source: string | null, placeId: string | null) {
  return source === "place" && placeId && /^[a-zA-Z0-9_-]{1,128}$/.test(placeId) ? `/place/${encodeURIComponent(placeId)}` : null;
}

export function savedMadiSelectionPath(entryId: string, source: string | null, placeId: string | null = null) {
  const params = new URLSearchParams({ savedEntryId: entryId });
  if (source === "explore" || source === "library" || source === "welcome" || source === "place") params.set("from", source);
  if (publicPlaceReturnPath(source, placeId)) params.set("placeId", placeId!);
  return `/madi/new?${params}`;
}
