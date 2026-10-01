import { createHash } from "node:crypto";

export const PLACE_OVERVIEW_SUMMARY_VERSION = "2026-10-01.1";
export const PLACE_OVERVIEW_SUMMARY_MODEL = "codex-direct";

type PlaceOverviewSummarySource = {
  contentTypeId: string | null;
  overview: string | null;
  experienceGuide: string | null;
};

export function createPlaceOverviewSummaryFingerprint(
  source: PlaceOverviewSummarySource,
) {
  const value = [
    source.contentTypeId ?? "",
    source.overview ?? "",
    source.experienceGuide ?? "",
  ].join("\u001f");

  return createHash("sha256").update(value).digest("hex");
}
