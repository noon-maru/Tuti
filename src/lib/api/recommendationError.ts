import type { RecommendationErrorCode } from "@/shared/api/recommendations";

export class RecommendationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: RecommendationErrorCode,
  ) {
    super(message);
    this.name = "RecommendationRequestError";
  }
}

export type RecommendationErrorKind = "network" | "location" | "server" | "unknown";

export function shouldRetryRecommendation(failureCount: number, error: unknown) {
  // 잘못된 요청·동의/인증 문제·후보 부족은 같은 입력으로 반복해도 해결되지 않는다.
  if (error instanceof RecommendationRequestError &&
    ((error.status >= 400 && error.status < 500) || error.code === "long_distance_unavailable" || error.code === "dog_catalog_not_ready")) return false;
  return failureCount < 1;
}

export function getRecommendationErrorKind(error: unknown): RecommendationErrorKind {
  if (!(error instanceof RecommendationRequestError)) return "unknown";
  if (error.code === "network_error") return "network";
  if ([
    "recommendation_location_required", "recommendation_location_invalid",
    "recommendation_region_invalid", "location_consent_required",
    "location_consent_outdated", "long_distance_location_required",
  ].includes(error.code ?? "")) return "location";
  // A long-distance empty result is not an infrastructure failure, even with HTTP 503.
  if (error.code === "long_distance_unavailable") return "unknown";
  if (error.status >= 500 && error.status <= 599) return "server";
  return "unknown";
}

export async function requestRecommendationResponse(
  request: () => Promise<Response>,
): Promise<Response> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new RecommendationRequestError("추천 서버에 연결하지 못했어요.", 0, "network_error");
    }
    throw error;
  }
}
