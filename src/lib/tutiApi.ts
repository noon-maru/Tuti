import type { TutiPlace } from "@/lib/recommendations";
import type {
  JournalEntriesResponse,
  TutiJournalEntry,
} from "@/shared/api/journal";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/shared/api/recommendations";
import type { IntakeAnswers, UserLocation } from "@/shared/tuti/types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "/api";

function apiUrl(path: string) {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function fetchRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
): Promise<TutiPlace[]> {
  const request: RecommendationRequest = { answers, location };
  const response = await fetch(apiUrl("recommendations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("추천 데이터를 불러오지 못했어요.");
  }

  const data = (await response.json()) as RecommendationResponse;
  return data.places;
}

export async function fetchJournalEntries(): Promise<TutiJournalEntry[]> {
  const response = await fetch(apiUrl("journal-entries"));

  if (!response.ok) {
    throw new Error("기록을 불러오지 못했어요.");
  }

  const data = (await response.json()) as JournalEntriesResponse;
  return data.entries;
}
