/** A removed source must not keep an old explicitly parsed duration alive. */
export function checkExplicitVisitTimeSource(
  current: string | null | undefined,
  originalInput: { usageDuration: string } | undefined,
): "fallback" | "matching" | "stale" {
  const normalizedCurrent = normalizeText(current);
  if (!normalizedCurrent) return "fallback";
  return originalInput && normalizeText(originalInput.usageDuration) === normalizedCurrent
    ? "matching"
    : "stale";
}

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
