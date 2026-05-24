import { createRecommendations } from "@/server/recommendations/service";
import type { IntakeAnswers, UserLocation } from "@/store/tuti";

export const runtime = "nodejs";

type RecommendationRequest = {
  answers?: IntakeAnswers;
  location?: UserLocation;
  stateText?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RecommendationRequest;
  const places = await createRecommendations(
    body.answers ?? {},
    normalizeLocation(body.location),
    normalizeStateText(body.stateText),
  );

  return Response.json({ places });
}

function normalizeLocation(location?: UserLocation) {
  if (!location) return undefined;

  const { latitude, longitude } = location;
  const isValidLatitude = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
  const isValidLongitude = Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

  if (!isValidLatitude || !isValidLongitude) {
    return undefined;
  }

  return { latitude, longitude };
}

function normalizeStateText(stateText?: string) {
  if (typeof stateText !== "string") return undefined;

  const trimmed = stateText.trim();

  return trimmed ? trimmed.slice(0, 400) : undefined;
}
