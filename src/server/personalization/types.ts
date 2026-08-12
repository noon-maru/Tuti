export const PERSONALIZATION_PROFILE_VERSION = "2026-08-12.1";

export const placeTraitKeys = [
  "quietness",
  "openness",
  "walkability",
  "sensoryIntensity",
  "soloFriendliness",
  "decisionBurden",
  "stayBurden",
  "novelty",
] as const;

export type PlaceTraitKey = (typeof placeTraitKeys)[number];
export type PlaceMeaningTraits = Record<PlaceTraitKey, number>;

export const preferenceKeys = [
  "quietness",
  "openness",
  "walkability",
  "lowSensory",
  "soloFriendliness",
  "lowDecisionBurden",
  "lowStayBurden",
  "novelty",
] as const;

export type PreferenceKey = (typeof preferenceKeys)[number];
export type UserSignalPreferences = Record<PreferenceKey, number>;

export type PlaceMeaningProfileValue = {
  traits: PlaceMeaningTraits;
  confidence: number;
  evidence: string[];
};

export type UserSignalProfileValue = {
  preferences: UserSignalPreferences;
  confidence: number;
};

export function parsePlaceMeaningProfile(
  value: unknown,
): PlaceMeaningProfileValue | null {
  if (!isRecord(value) || !isRecord(value.traits)) return null;
  const traits = parseNumberRecord(value.traits, placeTraitKeys);
  if (!traits || !isScore(value.confidence)) return null;

  return {
    traits,
    confidence: clamp(value.confidence),
    evidence: Array.isArray(value.evidence)
      ? value.evidence
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 4)
      : [],
  };
}

export function parseUserSignalProfile(
  value: unknown,
): UserSignalProfileValue | null {
  if (!isRecord(value) || !isRecord(value.preferences)) return null;
  const preferences = parseNumberRecord(value.preferences, preferenceKeys);
  if (!preferences || !isScore(value.confidence)) return null;

  return {
    preferences,
    confidence: clamp(value.confidence),
  };
}

function parseNumberRecord<Key extends string>(
  value: Record<string, unknown>,
  keys: readonly Key[],
): Record<Key, number> | null {
  const entries = keys.map((key) => [key, value[key]] as const);
  if (entries.some(([, score]) => !isScore(score))) return null;
  return Object.fromEntries(
    entries.map(([key, score]) => [key, clamp(score as number)]),
  ) as Record<Key, number>;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
