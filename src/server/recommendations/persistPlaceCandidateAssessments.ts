import { prisma } from "@/server/db/prisma";
import type { AssessedPlace } from "@/server/recommendations/loadPlaceCandidateAssessments";
import { PLACE_CANDIDATE_ALGORITHM_VERSION } from "@/server/recommendations/placeCandidateSelection";

const TRANSACTION_BATCH_SIZE = 100;

export async function persistPlaceCandidateAssessments(
  assessed: AssessedPlace[],
) {
  const evaluatedAt = new Date();
  let updated = 0;

  for (let index = 0; index < assessed.length; index += TRANSACTION_BATCH_SIZE) {
    const batch = assessed.slice(index, index + TRANSACTION_BATCH_SIZE);
    await prisma.$transaction(
      batch.map(({ place, assessment, candidateOverride }) =>
        prisma.place.update({
          where: { id: place.id },
          data: {
            candidateStatus: assessment.status,
            candidateScore: assessment.score,
            candidateSections: assessment.sections,
            candidateReasons: assessment.reasons,
            candidateExclusions: assessment.hardExclusions,
            candidateEvaluatedAt: evaluatedAt,
            candidateAlgorithmVersion: PLACE_CANDIDATE_ALGORITHM_VERSION,
            ...(candidateOverride === "auto"
              ? { isActive: assessment.status === "selected" }
              : {}),
          },
        }),
      ),
    );
    updated += batch.length;
  }

  return { updated, evaluatedAt };
}
