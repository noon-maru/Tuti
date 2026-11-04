export type HarumadiLibraryView = "covers" | "spines" | "carousel";
export const DEFAULT_LIBRARY_VIEW: HarumadiLibraryView = "carousel";
export const parseLibraryView = (value: unknown): HarumadiLibraryView => value === "covers" || value === "spines" || value === "carousel" ? value : DEFAULT_LIBRARY_VIEW;

/** Keep spine targets at least 64px wide, including the narrowest app layout. */
export function spineColumnCount(width: number) {
  return Math.max(1, Math.min(6, Math.floor((width - 16 + 12) / (64 + 12))));
}
