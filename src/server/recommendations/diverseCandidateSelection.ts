export function selectDiverseContentTypes<
  Place extends {
    id: string;
    sourceContentType?: string | null;
  },
>(
  places: Place[],
  limit: number,
  maxPerType: number,
  excludedPlaceIds: ReadonlySet<string> = new Set(),
) {
  const selected: Place[] = [];
  const selectedIds = new Set<string>();
  const typeCounts = new Map<string, number>();

  for (const place of places) {
    if (excludedPlaceIds.has(place.id)) continue;
    const contentType = place.sourceContentType ?? "unknown";
    const count = typeCounts.get(contentType) ?? 0;
    if (count >= maxPerType) continue;

    selected.push(place);
    selectedIds.add(place.id);
    typeCounts.set(contentType, count + 1);
    if (selected.length === limit) return selected;
  }

  for (const place of places) {
    if (excludedPlaceIds.has(place.id) || selectedIds.has(place.id)) continue;
    selected.push(place);
    if (selected.length === limit) break;
  }

  return selected;
}
