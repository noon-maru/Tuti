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
