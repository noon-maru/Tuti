import type { TutiPlace } from "@/lib/recommendations";
import { interpretState } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import type { RecommendationRequest } from "@/shared/api/recommendations";
import type { PersonalizationAudit } from "@/server/personalization/ranking";

type RecordRecommendationRunInput = {
  id: string;
  userId: string;
  request: RecommendationRequest;
  places: TutiPlace[];
  locationUsed: boolean;
  stateTextUsed: boolean;
  personalization?: PersonalizationAudit;
};

export async function recordRecommendationRunSafely({
  id,
  userId,
  request,
  places,
  locationUsed,
  stateTextUsed,
  personalization,
}: RecordRecommendationRunInput) {
  try {
    const answers = request.answers ?? {};

    await prisma.recommendationRun.create({
      data: {
        id,
        userId,
        algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
        answers: toJson(answers),
        state: toJson(interpretState(answers)),
        entryStatus: request.entryStatus,
        locationUsed,
        stateTextUsed,
        candidates: toJson(
          places.map((place, index) => ({
            rank: index + 1,
            placeId: place.id,
            reason: place.reason ?? null,
            reasonDetail: place.reasonDetail ?? null,
            reasonFactors: place.reasonFactors ?? [],
            cardPhrase: place.cardPhrase ?? null,
            fatigueScore: place.fatigueScore ?? null,
            distanceBand: toDistanceBand(place.distanceMeters),
            crowdForecast: place.crowdForecast ?? null,
          })),
        ),
        personalization: personalization ? toJson(personalization) : undefined,
      },
    });
  } catch (error) {
    console.error("추천 실행 스냅샷을 저장하지 못했습니다.", error);
  }
}

function toDistanceBand(distanceMeters: number | undefined) {
  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    return null;
  }
  if (distanceMeters < 2_000) return "under_2km";
  if (distanceMeters < 10_000) return "2_to_10km";
  if (distanceMeters < 30_000) return "10_to_30km";
  if (distanceMeters < 100_000) return "30_to_100km";
  return "over_100km";
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
