import { createHash } from "node:crypto";
import { createStructuredOpenAIResponse } from "@/server/llm/openaiClient";
import {
  parsePlaceMeaningProfile,
  parseUserSignalProfile,
  type PlaceMeaningProfileValue,
  type UserSignalProfileValue,
} from "@/server/personalization/types";

const score = { type: "number", minimum: 0, maximum: 1 };

const placeProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["traits", "confidence", "evidence"],
  properties: {
    traits: {
      type: "object",
      additionalProperties: false,
      required: [
        "quietness", "openness", "walkability", "sensoryIntensity",
        "soloFriendliness", "decisionBurden", "stayBurden", "novelty",
      ],
      properties: {
        quietness: score,
        openness: score,
        walkability: score,
        sensoryIntensity: score,
        soloFriendliness: score,
        decisionBurden: score,
        stayBurden: score,
        novelty: score,
      },
    },
    confidence: score,
    evidence: {
      type: "array",
      maxItems: 4,
      items: { type: "string", maxLength: 80 },
    },
  },
};

const userProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["preferences", "confidence"],
  properties: {
    preferences: {
      type: "object",
      additionalProperties: false,
      required: [
        "quietness", "openness", "walkability", "lowSensory",
        "soloFriendliness", "lowDecisionBurden", "lowStayBurden", "novelty",
      ],
      properties: {
        quietness: score,
        openness: score,
        walkability: score,
        lowSensory: score,
        soloFriendliness: score,
        lowDecisionBurden: score,
        lowStayBurden: score,
        novelty: score,
      },
    },
    confidence: score,
  },
};

export function createSourceFingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export async function generatePlaceMeaningProfile(
  source: unknown,
): Promise<PlaceMeaningProfileValue | null> {
  const result = await createStructuredOpenAIResponse({
    systemPrompt: `
너는 Tuti의 장소 의미 프로파일러다. 장소를 홍보하거나 문구를 창작하지 않는다.
검증된 원천 정보만 근거로, 지친 사람이 낮은 부담으로 상태를 전환하기에 어떤 성격의 공간인지 0~1로 구조화한다.
정보가 부족하면 추측을 키우지 말고 confidence를 낮춘다. evidence에는 입력에서 확인 가능한 짧은 한국어 근거만 쓴다.
quietness는 한적함, openness는 시야의 트임, walkability는 가볍게 걷기 좋음,
sensoryIntensity는 소리·빛·활동 자극, soloFriendliness는 혼자 머물기 편함,
decisionBurden은 현장에서 선택할 일의 많음, stayBurden은 오래 머물거나 준비할 부담,
novelty는 일상과 다른 감각의 정도다.
`.trim(),
    userPrompt: JSON.stringify(source),
    schemaName: "tuti_place_meaning_profile",
    schema: placeProfileSchema,
    description: "Tuti place meaning profile",
  });
  return parsePlaceMeaningProfile(result);
}

export async function generateUserSignalProfile(
  source: unknown,
): Promise<UserSignalProfileValue | null> {
  const result = await createStructuredOpenAIResponse({
    systemPrompt: `
너는 Tuti의 보이지 않는 행동 신호 해석기다. 사용자를 진단하거나 성격을 단정하지 않는다.
대화문을 만들지 않고, 최근 선택·출발 준비·길찾기·기록 행동에서 반복되는 공간 선호만 0~1로 구조화한다.
오늘의 명시적 답변은 이 프로필보다 항상 우선한다. 신호가 적거나 상충하면 confidence를 낮춘다.
개인 위치나 민감한 상태를 추론하지 않는다. 설명 문장이나 사용자 진단은 반환하지 않는다.
`.trim(),
    userPrompt: JSON.stringify(source),
    schemaName: "tuti_user_signal_profile",
    schema: userProfileSchema,
    description: "Tuti aggregated behavioral preference profile",
  });
  return parseUserSignalProfile(result);
}
