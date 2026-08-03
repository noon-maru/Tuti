import type { DepartureRouteMode } from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

export type TravelTimeRequest = {
  origin: UserLocation;
};

export type TravelTimeSummary = {
  mode: DepartureRouteMode;
  durationSeconds: number;
  distanceMeters: number | null;
};

export type TravelTimeResponse = {
  summary: TravelTimeSummary | null;
};
