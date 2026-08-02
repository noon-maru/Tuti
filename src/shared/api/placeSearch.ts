export type PlaceSearchResult = {
  id: string;
  name: string;
  region: string | null;
};

export type PlaceSearchResponse = {
  places: PlaceSearchResult[];
};
