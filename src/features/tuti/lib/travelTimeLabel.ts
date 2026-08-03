import type { TravelTimeSummary } from "@/shared/api/travelTime";

export function formatTravelTimeLabel(summary: TravelTimeSummary) {
  return `${getRouteModeLabel(summary.mode)} ${formatDuration(summary.durationSeconds)}`;
}

function getRouteModeLabel(mode: TravelTimeSummary["mode"]) {
  return {
    publicTransit: "대중교통",
    walking: "도보",
    bicycle: "자전거",
    driving: "자동차",
  }[mode];
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `약 ${minutes}분`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder
    ? `약 ${hours}시간 ${remainder}분`
    : `약 ${hours}시간`;
}
