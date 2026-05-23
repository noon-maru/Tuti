import { getRecommendations, type TutiPlace } from "@/lib/recommendations";
import type { IntakeAnswers } from "@/store/tuti";

type RecommendationResponse = {
  places: TutiPlace[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function fetchRecommendations(answers: IntakeAnswers): Promise<TutiPlace[]> {
  if (!apiBaseUrl) {
    return getRecommendations(answers);
  }

  const response = await fetch(`${apiBaseUrl}/recommendations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ answers }),
  });

  if (!response.ok) {
    throw new Error("추천 데이터를 불러오지 못했어요.");
  }

  const data = (await response.json()) as RecommendationResponse;
  return data.places;
}
