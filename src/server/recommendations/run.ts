import type { TutiPlace } from "@/lib/recommendations";
import { interpretState } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { lockLocationSubject } from "@/server/location/subjectLock";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import type { RecommendationRequest } from "@/shared/api/recommendations";
import type { PersonalizationAudit } from "@/server/personalization/ranking";

type RecordRecommendationRunInput = {
  id: string;
  userId: string;
  request: RecommendationRequest;
  places: TutiPlace[];
  locationUsed: boolean;
  locationConsentId?: string;
  stateTextUsed: boolean;
  personalization?: PersonalizationAudit;
};

export async function recordRecommendationRunSafely({
  id,
  userId,
  request,
  places,
  locationUsed,
  locationConsentId,
  stateTextUsed,
  personalization,
}: RecordRecommendationRunInput) {
  try {
    const answers = request.answers ?? {};

    await prisma.$transaction(async (transaction) => {
      if (locationUsed) {
        await lockLocationSubject(transaction, userId);
        const current = await transaction.locationConsentEvent.findFirst({
          where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        // after()는 응답 뒤 실행된다. 철회·재동의 이후 예전 위치 결과가 되살아나지 않게 한다.
        if (!locationConsentId || current?.id !== locationConsentId || current.status !== "accepted" ||
            !current.ageConfirmed || current.termsVersion !== LOCATION_TERMS_VERSION) return;
      }
      await transaction.recommendationRun.create({
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
              rankingScore: place.rankingScore ?? null,
              distanceBand: toDistanceBand(place.distanceMeters),
              crowdForecast: place.crowdForecast ?? null,
            })),
          ),
          personalization: personalization ? toJson(personalization) : undefined,
        },
      });
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
