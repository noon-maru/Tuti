import type { JournalEntryInput } from "@/shared/api/journal";

export function parseJournalEntryInput(
  value: unknown,
): JournalEntryInput | null {
  if (!isRecord(value)) return null;

  const {
    content,
    crowd,
    difficulty,
    image,
    placeName,
    title,
    visitedAt,
  } = value;

  if (
    typeof title !== "string" ||
    typeof content !== "string" ||
    typeof crowd !== "string" ||
    typeof placeName !== "string" ||
    typeof difficulty !== "string" ||
    (image !== null && typeof image !== "string") ||
    (visitedAt !== undefined && typeof visitedAt !== "string")
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
    placeName: placeName.trim() || "남긴 공간",
    difficulty: difficulty.trim() || "미정",
    visitedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
