import type { DepartureRouteMode } from "@/shared/api/departurePlan";
import type { TransportAnswer } from "@/shared/tuti/types";

export function getTravelTimeRoutePriority(
  transport: TransportAnswer | undefined,
  walkingDistance: boolean,
): DepartureRouteMode[] {
  if (transport === "car") return ["driving"];

  return [
    ...(walkingDistance ? (["walking"] as const) : []),
    "publicTransit",
    "driving",
    "bicycle",
  ];
}
