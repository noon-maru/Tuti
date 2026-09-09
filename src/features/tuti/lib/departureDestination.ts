export type DepartureDestination = {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
};

export function createDestinationGuidanceUrl({
  name,
  latitude,
  longitude,
}: DepartureDestination) {
  const normalizedName = name.trim();
  if (
    !normalizedName ||
    !isCoordinate(latitude, -90, 90) ||
    !isCoordinate(longitude, -180, 180)
  ) {
    return null;
  }

  return `https://map.kakao.com/link/to/${encodeURIComponent(normalizedName)},${latitude},${longitude}`;
}

function isCoordinate(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum;
}
