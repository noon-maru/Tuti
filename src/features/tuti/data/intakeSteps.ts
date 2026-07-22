export const intakeSteps = [
  {
    key: "movement",
    question: "오늘,\n닿을 수 있는 거리는 어디신가요?",
    subtitle: "지치지 않을 만큼의 장소를 찾아둘게요.",
    options: [
      { value: "near", label: "집 근처", hint: "아주 가까운 바깥" },
      { value: "short", label: "조금만", hint: "짧게 다녀오기" },
      { value: "half", label: "반나절 정도", hint: "조금 더 멀리" },
    ],
  },
  {
    key: "air",
    question: "어떤 공기가 필요할까요?",
    options: [
      { value: "quiet", label: "조용한 곳", hint: "말이 적은 자리" },
      { value: "water", label: "물 근처", hint: "시야가 트이는 곳" },
      { value: "walk", label: "걷기 좋은 곳", hint: "생각이 천천히 흐르는 길" },
    ],
  },
  {
    key: "alone",
    question: "혼자 있고 싶은가요?",
    options: [
      { value: "alone", label: "혼자가 좋아요", hint: "눈치 보지 않아도 되는 곳" },
      { value: "some", label: "조금은 괜찮아요", hint: "사람이 있어도 부담 없는 곳" },
    ],
  },
] as const;

export type IntakeStep = (typeof intakeSteps)[number];
