import type { DepartureRoute } from "@/shared/api/departurePlan";
import type { TravelTimeSummary } from "@/shared/api/travelTime";

export function toTravelTimeSummary(
  route: DepartureRoute | null,
): TravelTimeSummary | null {
  if (
    !route ||
    route.status !== "available" ||
    route.durationSeconds === null
  ) {
    return null;
  }

  return {
    mode: route.mode,
    durationSeconds: route.durationSeconds,
    distanceMeters: route.distanceMeters,
    transfers: route.mode === "publicTransit" ? route.transfers : 0,
    walkingDistanceMeters: calculateWalkingDistance(route),
  };
}

function calculateWalkingDistance(route: DepartureRoute) {
  if (route.mode === "walking") return route.distanceMeters;
  if (route.mode !== "publicTransit") return 0;

  const distances = route.steps.flatMap((step) => {
    if (step.distanceMeters === null) return [];
    const walkingStep =
      !step.vehicle || /도보|걷|보행/.test(step.guidance);
    return walkingStep ? [step.distanceMeters] : [];
  });

  return distances.length > 0
    ? distances.reduce((total, distance) => total + distance, 0)
    : null;
}
