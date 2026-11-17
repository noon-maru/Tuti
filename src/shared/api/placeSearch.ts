export type PlaceSearchResult = {
  id: string;
  name: string;
  region: string | null;
  image?: string;
  latitude?: number;
  longitude?: number;
  sourceContentType?: string;
};

export type PlaceSearchResponse = {
  places: PlaceSearchResult[];
};

/** Only an explicit dog answer restricts the search; missing answers never imply companionship. */
export function explorePlaceSearchScope(petCompanion: unknown): "dog-catalog" | "all-places" {
  return petCompanion === "dog" ? "dog-catalog" : "all-places";
}
export function explorePlaceSearchKey(query: string, petCompanion?: unknown) {
  return ["explore-place-search", explorePlaceSearchScope(petCompanion), query] as const;
}
