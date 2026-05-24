import { createRecommendations } from "@/server/recommendations/service";
import type { IntakeAnswers } from "@/store/tuti";

export const runtime = "nodejs";

type RecommendationRequest = {
  answers?: IntakeAnswers;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RecommendationRequest;
  const places = await createRecommendations(body.answers ?? {});

  return Response.json({ places });
}
