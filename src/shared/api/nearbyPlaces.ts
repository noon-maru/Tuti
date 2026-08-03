import type { PlaceSearchResult } from "@/shared/api/placeSearch";
import type { UserLocation } from "@/shared/tuti/types";

export type NearbyPlaceResult = PlaceSearchResult & {
  distanceMeters: number;
};

export type NearbyPlacesRequest = {
  location: UserLocation;
};

export type NearbyPlacesResponse = {
  places: NearbyPlaceResult[];
};
