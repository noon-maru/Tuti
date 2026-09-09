import { interpretState, type TutiPlace } from "@/lib/recommendations";
import {
  calculateMovementFatigue,
  scoreBreakdown,
} from "@/server/recommendations/fatigue";
import type { IntakeAnswers } from "@/shared/tuti/types";

export function rankLongDistanceCandidatePool<T extends TutiPlace>(
  candidates: T[],
  answers: IntakeAnswers,
  tieBreaker: (left: T, right: T) => number = () => 0,
) {
  const feature = interpretState({ ...answers, movement: "far" });

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreBreakdown(
        calculateMovementFatigue(candidate, answers, feature),
      ),
    }))
    .sort(
      (left, right) =>
        left.score - right.score ||
        tieBreaker(left.candidate, right.candidate) ||
        left.candidate.fatigue - right.candidate.fatigue ||
        left.candidate.id.localeCompare(right.candidate.id),
    )
    .map(({ candidate }) => candidate);
}

