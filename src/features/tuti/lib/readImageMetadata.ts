import type { UserLocation } from "@/shared/tuti/types";

const CAPTURE_DATE_TAGS = ["DateTimeOriginal", "CreateDate"] as const;

type CaptureDateMetadata = Partial<
  Record<(typeof CAPTURE_DATE_TAGS)[number], Date | string>
>;

export type ImageMetadata = {
  captureDate: string | null;
  location: UserLocation | null;
};

export async function readImageMetadata(
  file: File,
  { includeLocation = false }: { includeLocation?: boolean } = {},
): Promise<ImageMetadata> {
  try {
    const { default: exifr } = await import("exifr");
    const [dateResult, gpsResult] = await Promise.allSettled([
      exifr.parse(file, [...CAPTURE_DATE_TAGS]) as Promise<
        CaptureDateMetadata | undefined
      >,
      includeLocation
        ? (exifr.gps(file) as Promise<UserLocation | undefined>)
        : Promise.resolve(undefined),
    ]);
    const dateMetadata =
      dateResult.status === "fulfilled" ? dateResult.value : undefined;
    const location =
      gpsResult.status === "fulfilled"
        ? normalizeLocation(gpsResult.value)
        : null;

    return {
      captureDate: formatCaptureDate(
        dateMetadata?.DateTimeOriginal ?? dateMetadata?.CreateDate,
      ),
      location,
    };
  } catch {
    // Metadata is optional and must never prevent the image editor from opening.
    return { captureDate: null, location: null };
  }
}

function normalizeLocation(location: UserLocation | undefined) {
  if (
    !location ||
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    return null;
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function formatCaptureDate(value: Date | string | undefined) {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    return formatDateParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
  }

  const match = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);

  if (!match) return null;

  return formatDateParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

function formatDateParts(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day, 12);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}
