import type { TutiPlace } from "@/lib/recommendations";
import { interpretState } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/server/recommendations/service";
import type { RecommendationRequest } from "@/shared/api/recommendations";

type RecordRecommendationRunInput = {
  id: string;
  userId: string;
  request: RecommendationRequest;
  places: TutiPlace[];
  locationUsed: boolean;
  stateTextUsed: boolean;
};

export async function recordRecommendationRunSafely({
  id,
  userId,
  request,
  places,
  locationUsed,
  stateTextUsed,
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
            distanceMeters: place.distanceMeters ?? null,
            crowdForecast: place.crowdForecast ?? null,
          })),
        ),
      },
    });
  } catch (error) {
    console.error("추천 실행 스냅샷을 저장하지 못했습니다.", error);
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
