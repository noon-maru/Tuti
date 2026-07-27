const CAPTURE_DATE_TAGS = ["DateTimeOriginal", "CreateDate"] as const;

type CaptureDateMetadata = Partial<
  Record<(typeof CAPTURE_DATE_TAGS)[number], Date | string>
>;

export async function readImageCaptureDate(file: File) {
  try {
    const { default: exifr } = await import("exifr");
    const metadata = (await exifr.parse(file, [...CAPTURE_DATE_TAGS])) as
      | CaptureDateMetadata
      | undefined;

    return formatCaptureDate(
      metadata?.DateTimeOriginal ?? metadata?.CreateDate,
    );
  } catch {
    // Metadata is optional and must never prevent the image editor from opening.
    return null;
  }
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
