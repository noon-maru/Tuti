import type { IntakeAnswers } from "@/store/tuti";

export type StateFeature = {
  energy: "low" | "soft" | "open";
  movement: "near" | "short" | "half";
  crowdTolerance: "low" | "medium";
  goal: "clear_air" | "quiet_reset" | "light_walk";
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
};

export function interpretState(answers: IntakeAnswers): StateFeature {
  return {
    energy:
      answers.movement === "near"
        ? "low"
        : answers.movement === "short"
          ? "soft"
          : "open",
    movement: answers.movement ?? "short",
    crowdTolerance: answers.alone === "alone" ? "low" : "medium",
    goal:
      answers.air === "water"
        ? "clear_air"
        : answers.air === "walk"
          ? "light_walk"
          : "quiet_reset",
  };
}

export function getFatigueLimit(answers: IntakeAnswers) {
  const feature = interpretState(answers);

  return feature.movement === "near" ? 40 : feature.movement === "short" ? 52 : 80;
}

export function rankRecommendations(places: TutiPlace[], answers: IntakeAnswers): TutiPlace[] {
  const limit = getFatigueLimit(answers);
  const preferred = places.filter((place) => place.fatigue <= limit);
  const fallback = places.filter((place) => place.fatigue > limit);

  return [...preferred, ...fallback].slice(0, 6);
}
