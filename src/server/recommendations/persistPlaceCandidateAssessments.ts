import { prisma } from "@/server/db/prisma";
import type { AssessedPlace } from "@/server/recommendations/loadPlaceCandidateAssessments";
import { PLACE_CANDIDATE_ALGORITHM_VERSION } from "@/server/recommendations/placeCandidateSelection";
import { PLACE_RECOMMENDATION_FEATURE_VERSION } from "@/server/recommendations/placeRecommendationFeatures";

const TRANSACTION_BATCH_SIZE = 100;

export async function persistPlaceCandidateAssessments(
  assessed: AssessedPlace[],
) {
  const evaluatedAt = new Date();
  let updated = 0;

  for (let index = 0; index < assessed.length; index += TRANSACTION_BATCH_SIZE) {
    const batch = assessed.slice(index, index + TRANSACTION_BATCH_SIZE);
    await prisma.$transaction(
      batch.map(({
        place,
        assessment,
        candidateOverride,
        reviewStatus,
        visibilityOverride,
        recommendationFeatures,
      }) => {
        const belongsToPool =
          candidateOverride === "include" ||
          (candidateOverride === "auto" && assessment.status === "selected");

        return prisma.place.update({
          where: { id: place.id },
          data: {
            candidateStatus: assessment.status,
            candidateScore: assessment.score,
            candidateSections: assessment.sections,
            candidateReasons: assessment.reasons,
            candidateExclusions: assessment.hardExclusions,
            candidateEvaluatedAt: evaluatedAt,
            candidateAlgorithmVersion: PLACE_CANDIDATE_ALGORITHM_VERSION,
            fatigue: recommendationFeatures.fatigue,
            movementLevel: recommendationFeatures.movementLevel,
            experienceType: recommendationFeatures.experienceType,
            experienceTypeConfidence:
              recommendationFeatures.experienceTypeConfidence,
            experienceTypeEvidence:
              recommendationFeatures.experienceTypeEvidence,
            recommendationFeatureVersion: PLACE_RECOMMENDATION_FEATURE_VERSION,
            recommendationFeatureDerivedAt: evaluatedAt,
            ...(visibilityOverride === "auto"
              ? { moodTags: place.moodTags }
              : {}),
            ...(belongsToPool && reviewStatus === "pending"
              ? { reviewStatus: "approved" as const }
              : {}),
            ...(visibilityOverride === "auto"
              ? { isActive: belongsToPool }
              : {}),
          },
        });
      }),
    );
    updated += batch.length;
  }

  return { updated, evaluatedAt };
}
