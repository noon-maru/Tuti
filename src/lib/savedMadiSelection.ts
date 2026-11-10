/** Persist only the completed task's identifier, not another copy of private content. */
export function savedMadiSelectionPath(entryId: string, source: string | null) {
  const params = new URLSearchParams({ savedEntryId: entryId });
  if (source === "explore" || source === "library" || source === "welcome") params.set("from", source);
  return `/madi/new?${params}`;
}
