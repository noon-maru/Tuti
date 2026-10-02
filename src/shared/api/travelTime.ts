import type { DepartureRouteMode } from "@/shared/api/departurePlan";
import type { TransportAnswer, UserLocation } from "@/shared/tuti/types";

export type TravelTimeRequest = {
  origin: UserLocation;
  transport?: TransportAnswer;
};

export type TravelTimeSummary = {
  mode: DepartureRouteMode;
  durationSeconds: number;
  distanceMeters: number | null;
  transfers: number | null;
  walkingDistanceMeters: number | null;
};

export type TravelTimeResponse = {
  summary: TravelTimeSummary | null;
};
