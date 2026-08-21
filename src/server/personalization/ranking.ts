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
};

export async function personalizeRecommendationRanking(
  places: TutiPlace[],
  answers: IntakeAnswers,
  userId?: string,
): Promise<{ places: TutiPlace[]; audit: PersonalizationAudit }> {
  const mode = getPersonalizationMode();
  const originalPlaceIds = places.map((place) => place.id);
  const baseAudit: PersonalizationAudit = {
    mode,
    profileVersion: PERSONALIZATION_PROFILE_VERSION,
    applied: false,
    scoredPlaceCount: 0,
    originalPlaceIds,
  };

  if (mode === "off" || !userId || places.length < 2) {
    return { places, audit: baseAudit };
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
    return { places, audit: baseAudit };
  }

  const placeRows = await prisma.placeMeaningProfile.findMany({
    where: { placeId: { in: originalPlaceIds } },
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

  const ranked = places
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
    applied: mode === "active",
    userProfileConfidence: userProfile.confidence,
    scoredPlaceCount: profiles.size,
    personalizedPlaceIds,
  };

  return { places: mode === "active" ? ranked : places, audit };
}

export function calculateProfileMatch(
  preference: UserSignalPreferences,
  traits: PlaceMeaningTraits,
  answers: IntakeAnswers,
) {
  const pairs: Array<[number, number, number]> = [
    [preference.quietness, traits.quietness, answers.density === "quiet" ? 0.3 : 1],
    [preference.openness, traits.openness, answers.air === "open" ? 0.3 : 1],
    [preference.walkability, traits.walkability, answers.air === "walk" ? 0.3 : 1],
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
