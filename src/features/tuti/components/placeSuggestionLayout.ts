import type { PlaceSuggestionsResponse } from "@/shared/api/placeSuggestions";

/** Above the field: recent personal places sit nearest to the input. DOM and keyboard order agree. */
export function placeSuggestionGroups(data: PlaceSuggestionsResponse) {
  return [
    { source: "place" as const, label: "장소 검색 결과", rows: data.places },
    { source: "history" as const, label: "전에 남긴 장소", rows: [...data.history].reverse() },
  ];
}

type Bounds = { top: number; bottom: number; left: number; right: number };
export function placeSuggestionPosition(anchor: Bounds, frame: Bounds, visible: Bounds, layoutHeight: number) {
  const top = Math.max(frame.top, visible.top) + 8;
  const bottom = Math.min(frame.bottom, visible.bottom) - 8;
  const left = Math.max(frame.left, visible.left) + 8;
  const right = Math.min(frame.right, visible.right) - 8;
  // A hidden input must not leave a detached list over unrelated content.
  if (anchor.bottom <= top || anchor.top >= bottom || right <= left) return null;
  const panelBottom = Math.min(anchor.top - 6, bottom);
  const maxHeight = Math.min(300, panelBottom - top);
  const width = Math.min(anchor.right - anchor.left, right - left);
  if (maxHeight < 48 || width <= 0) return null;
  return { left: Math.max(left, Math.min(anchor.left, right - width)), width, bottom: layoutHeight - panelBottom, maxHeight };
}
