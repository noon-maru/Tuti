export function createOverviewPreview(
  storedSummary: string | null,
  rawOverview: string | null,
  fallbackDescription: string,
) {
  const normalizedSummary = normalize(storedSummary);
  if (normalizedSummary) return normalizedSummary;

  const normalizedOverview = normalize(rawOverview);
  if (!normalizedOverview) return fallbackDescription;
  if (normalizedOverview.length <= 180) return normalizedOverview;

  const previewRange = normalizedOverview.slice(0, 181);
  const sentenceEnd = Math.max(
    previewRange.lastIndexOf("."),
    previewRange.lastIndexOf("!"),
    previewRange.lastIndexOf("?"),
  );
  const cutAt = sentenceEnd >= 90 ? sentenceEnd + 1 : 180;

  return `${normalizedOverview.slice(0, cutAt).trim()}…`;
}

function normalize(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null;
}
