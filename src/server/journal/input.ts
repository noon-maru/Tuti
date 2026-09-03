import type { JournalEntryInput } from "@/shared/api/journal";

const MAX_IMAGE_INPUT_LENGTH = 7 * 1024 * 1024;
const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 4_000;
const MAX_PLACE_NAME_LENGTH = 120;
const MAX_TAG_LENGTH = 40;

export function parseJournalEntryInput(
  value: unknown,
): JournalEntryInput | null {
  if (!isRecord(value)) return null;

  const {
    content,
    crowd,
    difficulty,
    image,
    placeId,
    placeName,
    theme,
    title,
    visitedAt,
  } = value;

  if (
    typeof title !== "string" ||
    typeof content !== "string" ||
    typeof crowd !== "string" ||
    typeof placeName !== "string" ||
    typeof theme !== "string" ||
    typeof difficulty !== "string" ||
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
    placeName.trim().length > MAX_PLACE_NAME_LENGTH ||
    crowd.trim().length > MAX_TAG_LENGTH ||
    theme.trim().length > MAX_TAG_LENGTH ||
    difficulty.trim().length > MAX_TAG_LENGTH
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
    title: title.trim(),
    content: content.trim(),
    image,
    crowd: crowd.trim() || "미정",
    placeId:
      typeof placeId === "string" && placeId.trim()
        ? placeId.trim()
        : null,
    placeName: placeName.trim() || "남긴 공간",
    theme: theme.trim() || "미정",
    difficulty: difficulty.trim() || "미정",
    visitedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
