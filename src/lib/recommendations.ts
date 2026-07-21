import type { IntakeAnswers } from "@/store/tuti";

export type StateFeature = {
  energy: "low" | "soft" | "open";
  movement: "near" | "short" | "half";
  crowdTolerance: "low" | "medium";
  goal: "clear_air" | "quiet_reset" | "light_walk";
  burdenNote: string;
};

export type TutiPlace = {
  id: string;
  name: string;
  phrase: string;
  note: string;
  image: string;
  travelTime: string;
  crowd: string;
  today: string;
  fatigue: number;
  movementLevel: "near" | "short" | "half";
  moodTags: string[];
  distanceMeters?: number;
  fatigueScore?: number;
  reason?: string;
};

export function interpretState(answers: IntakeAnswers): StateFeature {
  const movement = answers.movement ?? "short";

  return {
    energy:
      movement === "near"
        ? "low"
        : movement === "short"
          ? "soft"
          : "open",
    movement,
    crowdTolerance: answers.alone === "alone" ? "low" : "medium",
    goal:
      answers.air === "water"
        ? "clear_air"
        : answers.air === "walk"
          ? "light_walk"
          : "quiet_reset",
    burdenNote:
      answers.movement === "near"
        ? "오늘은 가까운 쪽으로만 골랐어요."
        : "오늘 가능한 정도에 맞춰 가볍게 골랐어요.",
  };
}
