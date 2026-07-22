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
    question: "지금,\n어떤 공기가 필요하신가요?",
    subtitle: "마음을 환기하기에 가장 알맞은 곳을 찾아드릴게요.",
    options: [
      {
        value: "quiet",
        label: "조용한 곳",
        hint: "소음이 없고 한적하여 혼자 머물기 좋은 공간",
      },
      {
        value: "open",
        label: "트인 곳",
        hint: "시야가 넓게 열려 답답함을 해소할 수 있는 공간",
      },
      {
        value: "walk",
        label: "걷기 좋은 곳",
        hint: "목적지 없이 가볍게 산책하기 좋은 길",
      },
    ],
  },
  {
    key: "density",
    question: "오늘,\n어떤 분위기 속에 있고 싶으세요?",
    subtitle: "편안함을 느끼는 밀도의 공간을 찾아드릴게요.",
    options: [
      {
        value: "quiet",
        label: "조금 한적하면 좋겠어요",
        hint: "조용히 혼자만의 시간에 집중하기 좋은 공간",
      },
      {
        value: "balanced",
        label: "적당히 북적여도 괜찮아요",
        hint: "사람들의 말소리가 백색소음처럼 가볍게 들려오는 공간",
      },
      {
        value: "lively",
        label: "활기찬 곳도 좋아요",
        hint: "생동감과 일상의 활기를 느끼기 좋은 공간",
      },
    ],
  },
] as const;

export type IntakeStep = (typeof intakeSteps)[number];
