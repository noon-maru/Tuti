import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import {
  getPersonalizationMode,
  type PersonalizationMode,
} from "@/server/personalization/config";
import {
  parsePlaceMeaningProfile,
  parseUserSignalProfile,
  PERSONALIZATION_PROFILE_VERSION,
  type PlaceMeaningTraits,
  type UserSignalPreferences,
} from "@/server/personalization/types";
import type { IntakeAnswers } from "@/shared/tuti/types";

export type PersonalizationAudit = {
  mode: PersonalizationMode;
  profileVersion: string;
  applied: boolean;
  userProfileConfidence?: number;
  scoredPlaceCount: number;
  originalPlaceIds: string[];
  personalizedPlaceIds?: string[];
  savedPlacePreferenceCount?: number;
  savedPlaceScoredCount?: number;
  savedPlacePersonalizationApplied?: boolean;
};

export async function personalizeRecommendationRanking(
  places: TutiPlace[],
  answers: IntakeAnswers,
  userId?: string,
  preferencePlaceIds: string[] = [],
): Promise<{ places: TutiPlace[]; audit: PersonalizationAudit }> {
  const mode = getPersonalizationMode();
  const originalPlaceIds = places.map((place) => place.id);
  const savedPreference = await personalizeBySavedPlaces(
    places,
    preferencePlaceIds,
  );
  const baseAudit: PersonalizationAudit = {
    mode,
    profileVersion: PERSONALIZATION_PROFILE_VERSION,
    applied: savedPreference.applied,
    scoredPlaceCount: 0,
    originalPlaceIds,
    savedPlacePreferenceCount: savedPreference.preferenceCount,
    savedPlaceScoredCount: savedPreference.scoredPlaceCount,
    savedPlacePersonalizationApplied: savedPreference.applied,
    ...(savedPreference.applied
      ? { personalizedPlaceIds: savedPreference.places.map((place) => place.id) }
      : {}),
  };

  if (mode === "off" || !userId || savedPreference.places.length < 2) {
    return { places: savedPreference.places, audit: baseAudit };
  }

  const userRow = await prisma.userSignalProfile.findUnique({
    where: { userId },
  });
  const userProfile = parseUserSignalProfile(
    userRow
      ? { preferences: userRow.preferences, confidence: userRow.confidence }
      : null,
  );
  if (!userProfile || userProfile.confidence < 0.35) {
    return { places: savedPreference.places, audit: baseAudit };
  }

  const placeRows = await prisma.placeMeaningProfile.findMany({
    where: {
      placeId: { in: savedPreference.places.map((place) => place.id) },
    },
  });

  const profiles = new Map(
    placeRows
      .map((row) => {
        const profile = parsePlaceMeaningProfile({
          traits: row.traits,
          confidence: row.confidence,
          evidence: row.evidence,
        });
        return profile ? ([row.placeId, profile] as const) : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  );

  const ranked = savedPreference.places
    .map((place, index) => {
      const profile = profiles.get(place.id);
      const match = profile
        ? calculateProfileMatch(
            userProfile.preferences,
            profile.traits,
            answers,
          ) * userProfile.confidence * profile.confidence
        : 0.5;

      // 원래 순위가 기준이다. 프로필은 동점권에서만 최대 약 두 칸 움직인다.
      return { place, index, score: index - (match - 0.5) * 3.2 };
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ place }) => place);
  const personalizedPlaceIds = ranked.map((place) => place.id);
  const audit: PersonalizationAudit = {
    ...baseAudit,
    applied: savedPreference.applied || mode === "active",
    userProfileConfidence: userProfile.confidence,
    scoredPlaceCount: profiles.size,
    personalizedPlaceIds,
  };

  return {
    places: mode === "active" ? ranked : savedPreference.places,
    audit,
  };
}

type SavedPreferenceResult = {
  places: TutiPlace[];
  applied: boolean;
  preferenceCount: number;
  scoredPlaceCount: number;
};

async function personalizeBySavedPlaces(
  places: TutiPlace[],
  preferencePlaceIds: string[],
): Promise<SavedPreferenceResult> {
  const uniquePreferenceIds = Array.from(
    new Set(preferencePlaceIds.map((placeId) => placeId.trim()).filter(Boolean)),
  ).slice(0, 20);
  if (places.length < 2 || uniquePreferenceIds.length === 0) {
    return {
      places,
      applied: false,
      preferenceCount: 0,
      scoredPlaceCount: 0,
    };
  }

  const candidateIds = places.map((place) => place.id);
  const [savedPlaces, profileRows] = await Promise.all([
    prisma.place.findMany({
      where: { id: { in: uniquePreferenceIds } },
      select: { id: true, moodTags: true, experienceType: true },
    }),
    prisma.placeMeaningProfile.findMany({
      where: {
        placeId: {
          in: Array.from(new Set([...uniquePreferenceIds, ...candidateIds])),
        },
      },
    }),
  ]);
  if (savedPlaces.length === 0) {
    return {
      places,
      applied: false,
      preferenceCount: 0,
      scoredPlaceCount: 0,
    };
  }

  const profiles = new Map(
    profileRows
      .map((row) => {
        const profile = parsePlaceMeaningProfile({
          traits: row.traits,
          confidence: row.confidence,
          evidence: row.evidence,
        });
        return profile ? ([row.placeId, profile] as const) : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  );
  const savedProfiles = savedPlaces.flatMap((place) => {
    const profile = profiles.get(place.id);
    return profile ? [profile] : [];
  });
  const meaningPreference = averagePlaceMeaningProfiles(savedProfiles);
  const moodFrequency = countValues(
    savedPlaces.flatMap((place) => place.moodTags),
  );
  const experienceFrequency = countValues(
    savedPlaces.flatMap((place) =>
      place.experienceType ? [place.experienceType] : [],
    ),
  );
  let scoredPlaceCount = 0;
  const ranked = places
    .map((place, index) => {
      const scores: Array<{ value: number; weight: number }> = [];
      const profile = profiles.get(place.id);
      if (meaningPreference && profile) {
        scores.push({
          value:
            calculateProfileMatch(meaningPreference, profile.traits, {}) *
            profile.confidence,
          weight: 0.65,
        });
      }
      if (place.moodTags.length > 0 && moodFrequency.size > 0) {
        const moodMatch =
          place.moodTags.reduce(
            (sum, tag) =>
              sum + (moodFrequency.get(tag) ?? 0) / savedPlaces.length,
            0,
          ) / place.moodTags.length;
        scores.push({ value: Math.min(1, moodMatch), weight: 0.25 });
      }
      if (place.experienceType && experienceFrequency.size > 0) {
        scores.push({
          value:
            (experienceFrequency.get(place.experienceType) ?? 0) /
            savedPlaces.length,
          weight: 0.1,
        });
      }
      const totalWeight = scores.reduce((sum, score) => sum + score.weight, 0);
      const match = totalWeight > 0
        ? scores.reduce(
            (sum, score) => sum + score.value * score.weight,
            0,
          ) / totalWeight
        : 0.5;
      if (scores.length > 0) scoredPlaceCount += 1;

      // 저장 신호는 기존 추천을 대체하지 않고 동점권에서 최대 한두 칸만 움직인다.
      return { place, index, score: index - (match - 0.5) * 2.4 };
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ place }) => place);

  return {
    places: scoredPlaceCount > 0 ? ranked : places,
    applied: scoredPlaceCount > 0,
    preferenceCount: savedPlaces.length,
    scoredPlaceCount,
  };
}

function averagePlaceMeaningProfiles(
  profiles: Array<{ traits: PlaceMeaningTraits; confidence: number }>,
): UserSignalPreferences | null {
  if (profiles.length === 0) return null;
  const totalConfidence = profiles.reduce(
    (sum, profile) => sum + profile.confidence,
    0,
  );
  if (totalConfidence <= 0) return null;
  const average = (pick: (traits: PlaceMeaningTraits) => number) =>
    profiles.reduce(
      (sum, profile) => sum + pick(profile.traits) * profile.confidence,
      0,
    ) / totalConfidence;

  return {
    quietness: average((traits) => traits.quietness),
    openness: average((traits) => traits.openness),
    walkability: average((traits) => traits.walkability),
    lowSensory: average((traits) => 1 - traits.sensoryIntensity),
    soloFriendliness: average((traits) => traits.soloFriendliness),
    lowDecisionBurden: average((traits) => 1 - traits.decisionBurden),
    lowStayBurden: average((traits) => 1 - traits.stayBurden),
    novelty: average((traits) => traits.novelty),
  };
}

function countValues(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

export function calculateProfileMatch(
  preference: UserSignalPreferences,
  traits: PlaceMeaningTraits,
  answers: IntakeAnswers,
) {
  const pairs: Array<[number, number, number]> = [
    [preference.quietness, traits.quietness, 1],
    [preference.openness, traits.openness, 1],
    [preference.walkability, traits.walkability, 1],
    [preference.lowSensory, 1 - traits.sensoryIntensity, 1],
    [preference.soloFriendliness, traits.soloFriendliness, answers.companion ? 0.5 : 1],
    [preference.lowDecisionBurden, 1 - traits.decisionBurden, 1.2],
    [preference.lowStayBurden, 1 - traits.stayBurden, 1.2],
    [preference.novelty, traits.novelty, 0.8],
  ];
  const weighted = pairs.reduce(
    (result, [wanted, actual, weight]) => ({
      score: result.score + (1 - Math.abs(wanted - actual)) * weight,
      weight: result.weight + weight,
    }),
    { score: 0, weight: 0 },
  );
  return weighted.score / weighted.weight;
}
