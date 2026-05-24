import type { TutiPlace } from "@/lib/recommendations";
import type { IntakeAnswers, UserLocation } from "@/store/tuti";

type RecommendationResponse = {
  places: TutiPlace[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "/api";

function apiUrl(path: string) {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function fetchRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
): Promise<TutiPlace[]> {
  const response = await fetch(apiUrl("recommendations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ answers, location }),
  });

  if (!response.ok) {
    throw new Error("추천 데이터를 불러오지 못했어요.");
  }

  const data = (await response.json()) as RecommendationResponse;
  return data.places;
}
