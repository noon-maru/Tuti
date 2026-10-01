import { movementTimeBudget } from "@/shared/tuti/movementTimeBudget";

export const intakeSteps = [
  {
    key: "movement",
    question: "오늘,\n바깥에 시간을 낼 수 있을까요?",
    subtitle: "그 안에서 무리 없이 다녀올 곳을 찾아둘게요.",
    options: [
      {
        value: "near",
        label: movementTimeBudget.near.label,
        hint: movementTimeBudget.near.hint,
      },
      {
        value: "short",
        label: movementTimeBudget.short.label,
        hint: movementTimeBudget.short.hint,
      },
      {
        value: "half",
        label: movementTimeBudget.half.label,
        hint: movementTimeBudget.half.hint,
      },
      {
        value: "far",
        label: movementTimeBudget.far.label,
        hint: movementTimeBudget.far.hint,
      },
    ],
  },
  {
    key: "transport",
    question: "오늘,\n차로 움직일 수 있을까요?",
    subtitle: "가는 길이 덜 힘든 쪽으로 골라둘게요.",
    options: [
      {
        value: "car",
        label: "차로 갈 수 있어요",
        hint: "자동차로 편하게 닿는 곳까지",
      },
      {
        value: "transit",
        label: "차 없이 갈게요",
        hint: "대중교통과 도보가 편한 곳으로",
      },
    ],
  },
] as const;

export const longDistanceTimingStep = {
  key: "longDistanceTiming",
  question: "이번에는,\n언제 떠나볼까요?",
  subtitle: "돌아오는 길까지 생각하지 않아도 되게 맞춰둘게요.",
  options: [
    {
      value: "tomorrow_day_trip",
      label: "내일 가볍게",
      hint: "내일 떠나, 하루 안에 돌아오기",
    },
    {
      value: "overnight_trip",
      label: "오늘 떠나기",
      hint: "오늘 떠나, 하룻밤 머물기",
    },
  ],
} as const;

export function getIntakeSteps(answers: { movement?: string }) {
  return answers.movement === "far"
    ? [...intakeSteps, longDistanceTimingStep]
    : [...intakeSteps];
}

export type IntakeStep =
  | (typeof intakeSteps)[number]
  | typeof longDistanceTimingStep;
