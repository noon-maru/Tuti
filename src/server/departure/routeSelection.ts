import type { UserLocation } from "@/shared/tuti/types";

export const WALKING_DISTANCE_LIMIT_METERS = 1_800;

export function isWalkingDistance(
  origin: UserLocation,
  destination: UserLocation,
) {
  return (
    calculateDistanceMeters(origin, destination) <=
    WALKING_DISTANCE_LIMIT_METERS
  );
}

function calculateDistanceMeters(
  origin: UserLocation,
  destination: UserLocation,
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(
    destination.longitude - origin.longitude,
  );
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
