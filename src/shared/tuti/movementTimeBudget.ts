import type { MovementAnswer } from "@/shared/tuti/types";

export const movementTimeBudget: Record<
  MovementAnswer,
  { minutes: number; label: string; hint: string }
> = {
  near: {
    minutes: 60,
    label: "한 시간 안에",
    hint: "왕복 이동과 머무는 시간까지",
  },
  short: {
    minutes: 120,
    label: "한두 시간",
    hint: "가볍게 다녀오기",
  },
  half: {
    minutes: 360,
    label: "반나절",
    hint: "서두르지 않아도 되게",
  },
  far: {
    minutes: 720,
    label: "오늘 하루",
    hint: "멀리, 하지만 가볍고 편하게",
  },
};

