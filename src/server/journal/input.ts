import type { JournalEntryInput } from "@/shared/api/journal";

const MAX_IMAGE_INPUT_LENGTH = 7 * 1024 * 1024;
const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 4_000;
const MAX_PLACE_NAME_LENGTH = 120;

export function parseJournalEntryInput(
  value: unknown,
): JournalEntryInput | null {
  if (!isRecord(value)) return null;
  if (value.harumadiId !== undefined && (typeof value.harumadiId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.harumadiId))) return null;
  if (value.sensitiveContent !== undefined && typeof value.sensitiveContent !== "boolean") return null;
  if (value.sensitiveConsentVersion !== undefined && (typeof value.sensitiveConsentVersion !== "string" || value.sensitiveConsentVersion.length > 80)) return null;

  const {
    content,
    image,
    placeId,
    placeName,
    title,
    visitedAt,
  } = value;

  if (
    typeof title !== "string" ||
    typeof content !== "string" ||
    typeof placeName !== "string" ||
    (image !== null && typeof image !== "string") ||
    (placeId !== undefined && placeId !== null && typeof placeId !== "string") ||
    (visitedAt !== undefined && typeof visitedAt !== "string")
  ) {
    return null;
  }

  if (image && image.length > MAX_IMAGE_INPUT_LENGTH) return null;

  if (
    title.trim().length > MAX_TITLE_LENGTH ||
    content.trim().length > MAX_CONTENT_LENGTH ||
    placeName.trim().length > MAX_PLACE_NAME_LENGTH
  ) {
    return null;
  }

  if (
    visitedAt !== undefined &&
    Number.isNaN(new Date(visitedAt).getTime())
  ) {
    return null;
  }

  return {
    ...(typeof value.harumadiId === "string" ? { harumadiId: value.harumadiId } : {}),
    title: title.trim(),
    content: content.trim(),
    image,
    placeId:
      typeof placeId === "string" && placeId.trim()
        ? placeId.trim()
        : null,
    placeName: placeName.trim() || "남긴 공간",
    visitedAt,
    ...(typeof value.sensitiveContent === "boolean" ? { sensitiveContent: value.sensitiveContent } : {}),
    ...(typeof value.sensitiveConsentVersion === "string" ? { sensitiveConsentVersion: value.sensitiveConsentVersion } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
