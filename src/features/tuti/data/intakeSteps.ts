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
    key: "air",
    question: "지금,\n어떤 공기가 필요하신가요?",
    subtitle: "지금 필요한 공기에 가까운 곳을 골라둘게요.",
    options: [
      {
        value: "quiet",
        label: "조용한 곳",
        hint: "말소리가 적어 혼자 머물기 좋은 곳",
      },
      {
        value: "open",
        label: "트인 곳",
        hint: "시야가 트여 잠깐 숨 돌리기 좋은 곳",
      },
      {
        value: "walk",
        label: "걷기 좋은 곳",
        hint: "천천히 걸으며 생각을 비우기 좋은 곳",
      },
    ],
  },
  {
    key: "density",
    question: "오늘,\n사람은 어느 정도 곁에 있어도 괜찮을까요?",
    subtitle: "편안하게 머물 수 있는 분위기에 맞춰볼게요.",
    options: [
      {
        value: "quiet",
        label: "조금 한적하면 좋겠어요",
        hint: "말소리가 적어 혼자 머물기 좋은 곳",
      },
      {
        value: "balanced",
        label: "적당히 북적여도 괜찮아요",
        hint: "사람들의 기척이 가볍게 느껴지는 곳",
      },
      {
        value: "lively",
        label: "활기찬 곳도 좋아요",
        hint: "주변의 활기를 함께 느끼기 좋은 곳",
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
