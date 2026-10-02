type AdaptiveCandidateEvaluationOptions<Candidate, Eligible> = {
  maximumBatchCount: number;
  targetCount: number;
  initialBatchSize: number;
  supplementalBatchSize: number;
  selectBatch: (batchSize: number) => Candidate[];
  evaluateBatch: (batch: Candidate[]) => Promise<Eligible[]>;
};

export async function collectEligibleCandidatesInBatches<Candidate, Eligible>({
  maximumBatchCount,
  targetCount,
  initialBatchSize,
  supplementalBatchSize,
  selectBatch,
  evaluateBatch,
}: AdaptiveCandidateEvaluationOptions<Candidate, Eligible>) {
  const eligibleCandidates: Eligible[] = [];

  for (
    let batchIndex = 0;
    batchIndex < maximumBatchCount;
    batchIndex += 1
  ) {
    const batchSize = batchIndex === 0
      ? initialBatchSize
      : supplementalBatchSize;
    const candidateBatch = selectBatch(batchSize);
    if (candidateBatch.length === 0) break;

    eligibleCandidates.push(...await evaluateBatch(candidateBatch));
    if (eligibleCandidates.length >= targetCount) break;
  }

  return eligibleCandidates;
}
