import type {
  PlaceSuggestedStep,
  TourismPlaceDetail,
} from "@/shared/api/placeDetails";
import type { TransportAnswer, UserLocation } from "@/shared/tuti/types";

export type DepartureRouteMode =
  | "publicTransit"
  | "walking"
  | "bicycle"
  | "driving";

export type DepartureRouteStep = {
  guidance: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  vehicle: string | null;
};

export type DepartureRoute = {
  mode: DepartureRouteMode;
  status: "pending" | "available" | "unavailable";
  durationSeconds: number | null;
  distanceMeters: number | null;
  transfers: number | null;
  fareWon: number | null;
  tollWon: number | null;
  taxiFareWon: number | null;
  externalUrl: string | null;
  steps: DepartureRouteStep[];
};

export type DepartureNearbyPlace = {
  id: string;
  name: string;
  kind: "continuation" | "rest";
  category: "attraction" | "culture" | "cafe";
  categoryName: string;
  address: string | null;
  phone: string | null;
  distanceMeters: number | null;
  latitude: number;
  longitude: number;
  externalUrl: string;
};

export type DeparturePlanStep = PlaceSuggestedStep;

export type DeparturePlanRequest = {
  origin: UserLocation;
  transport?: TransportAnswer;
};

export type DepartureRouteRequest = {
  origin: UserLocation;
  mode: DepartureRouteMode;
};

export type DepartureRouteResponse = {
  route: DepartureRoute;
};

export type DepartureNearbyResponse = {
  nearbyPlaces: DepartureNearbyPlace[];
};

export type DeparturePlan = {
  place: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  };
  detail: TourismPlaceDetail | null;
  routes: Record<DepartureRouteMode, DepartureRoute>;
  recommendedMode: DepartureRouteMode | null;
  nearbyPlaces: DepartureNearbyPlace[];
  suggestedPlan: DeparturePlanStep[];
  generatedAt: string;
};

export type DeparturePlanResponse = {
  plan: DeparturePlan;
};
