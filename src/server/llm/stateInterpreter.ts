import { interpretState, type StateFeature } from "@/lib/recommendations";
import { createStructuredOpenAIResponse } from "@/server/llm/openaiClient";
import type { IntakeAnswers } from "@/store/tuti";

type StateInterpretationInput = {
  answers: IntakeAnswers;
  stateText?: string;
};

const stateFeatureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["energy", "movement", "crowdTolerance", "goal", "burdenNote"],
  properties: {
    energy: {
      type: "string",
      enum: ["low", "soft", "open"],
      description: "How much energy the user appears to have today.",
    },
    movement: {
      type: "string",
      enum: ["near", "short", "half"],
      description: "How far the user can probably move without strain.",
    },
    crowdTolerance: {
      type: "string",
      enum: ["low", "medium"],
      description: "How much crowd pressure the user can tolerate.",
    },
    goal: {
      type: "string",
      enum: ["clear_air", "quiet_reset", "light_walk"],
      description: "The kind of small state shift the user seems to need.",
    },
    burdenNote: {
      type: "string",
      minLength: 8,
      maxLength: 42,
      description: "A short Korean sentence that lowers pressure without sounding motivational.",
    },
  },
};

const systemPrompt = `
너는 Tuti의 보이지 않는 상태 해석기다.
Tuti는 관광 추천, 여행 계획, 생산성, 자기계발, AI 비서가 아니다.
목적은 지친 사람이 아주 낮은 부담으로 잠깐 일상 밖으로 나갈 수 있게 돕는 것이다.

규칙:
- 사용자를 분석하거나 교정하지 않는다.
- 여행지나 일정을 추천하지 않는다.
- 과한 위로, 힐링 강요, 동기부여 문장을 쓰지 않는다.
- 현재 감당 가능한 움직임 크기와 부담 요소만 조용히 구조화한다.
- burdenNote는 한국어 한 문장으로 짧게 쓴다.
- burdenNote는 '~하세요', '~해보세요'처럼 지시하지 않는다.
- JSON schema에 맞는 값만 반환한다.
`.trim();

export async function interpretStateWithLlm({
  answers,
  stateText,
}: StateInterpretationInput): Promise<StateFeature> {
  const fallback = interpretState(answers);
  const hasStructuredAnswer = Object.values(answers).some(Boolean);

  if (!hasStructuredAnswer && !stateText?.trim()) {
    return fallback;
  }

  const result = await createStructuredOpenAIResponse({
    systemPrompt,
    userPrompt: JSON.stringify({
      structuredAnswers: describeAnswers(answers),
      freeText: stateText?.trim() || null,
      fallback,
    }),
    schemaName: "tuti_state_feature",
    schema: stateFeatureSchema,
  });

  return parseStateFeature(result) ?? fallback;
}

function parseStateFeature(value: unknown): StateFeature | null {
  if (!isRecord(value)) return null;

  const { energy, movement, crowdTolerance, goal, burdenNote } = value;

  if (
    !isOneOf(energy, ["low", "soft", "open"]) ||
    !isOneOf(movement, ["near", "short", "half"]) ||
    !isOneOf(crowdTolerance, ["low", "medium"]) ||
    !isOneOf(goal, ["clear_air", "quiet_reset", "light_walk"]) ||
    typeof burdenNote !== "string"
  ) {
    return null;
  }

  return {
    energy,
    movement,
    crowdTolerance,
    goal,
    burdenNote: burdenNote.trim().slice(0, 60),
  };
}

function describeAnswers(answers: IntakeAnswers) {
  return {
    movement: {
      value: answers.movement ?? null,
      meaning:
        answers.movement === "near"
          ? "집 근처 정도"
          : answers.movement === "half"
            ? "반나절 정도"
            : "조금만 움직일 수 있음",
    },
    air: {
      value: answers.air ?? null,
      meaning:
        answers.air === "water"
          ? "시야가 트이는 물 근처"
          : answers.air === "walk"
            ? "천천히 걷기 좋은 공기"
            : "조용한 곳",
    },
    alone: {
      value: answers.alone ?? null,
      meaning:
        answers.alone === "alone"
          ? "혼자 있고 싶음"
          : "사람이 조금 있어도 괜찮음",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}
