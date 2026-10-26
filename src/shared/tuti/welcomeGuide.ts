export const WELCOME_GUIDE = [
  { title: "사진 한 장부터\n시작해볼까요?", description: "오래 기억하고 싶은,\n함께한 순간을 골라요." },
  { title: "짧은 이야기면\n충분해요.", description: "그날의 기분을 한두 문장으로.\n사진만 남겨도 괜찮아요." },
  { title: "함께한 하루를,\n우리만의 책으로.", description: "디지털 하루마디에 모아두고,\n두고두고 꺼내보세요." },
] as const;

export type WelcomeGuideStep = 0 | 1 | 2;

export function parseWelcomeGuideStep(mode: string | null, step: string | null): WelcomeGuideStep | null {
  if (mode !== "guide") return null;
  return step === "1" ? 1 : step === "2" ? 2 : 0;
}

export function welcomeGuidePath(step: WelcomeGuideStep) {
  return `/entry?mode=guide&step=${step}`;
}
