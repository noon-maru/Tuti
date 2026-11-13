export const PLACE_FAMILIARITY_RETENTION_DAYS = 180;
export type PlaceFamiliarityInput = { placeId: string; familiar: boolean };
export function parsePlaceFamiliarity(input: unknown): PlaceFamiliarityInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Partial<PlaceFamiliarityInput>;
  return typeof value.placeId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value.placeId) && typeof value.familiar === "boolean"
    ? { placeId: value.placeId, familiar: value.familiar } : null;
}
