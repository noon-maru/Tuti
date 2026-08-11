import { authenticateAdmin } from "@/server/admin/auth";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { simulateRecommendations } from "@/server/recommendations/service";
import type { AdminRecommendationSimulationRequest } from "@/shared/api/admin";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import type {
  AirAnswer,
  DensityAnswer,
  MovementAnswer,
} from "@/shared/tuti/types";

export const runtime = "nodejs";

const movementAnswers = new Set<MovementAnswer>([
  "near",
  "short",
  "half",
  "far",
]);
const airAnswers = new Set<AirAnswer>(["quiet", "open", "walk"]);
const densityAnswers = new Set<DensityAnswer>([
  "quiet",
  "balanced",
  "lively",
]);

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const input = await readInput(request);
  if (!input.ok) {
    return withCors(
      request,
      Response.json({ error: input.error }, { status: 400 }),
    );
  }

  const startedAt = performance.now();
  const simulation = await simulateRecommendations(
    input.value.answers,
    input.value.location,
    input.value.stateText,
    input.value.preferredRegion,
  );

  return withCors(
    request,
    Response.json({
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      generatedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - startedAt),
      feature: simulation.feature,
      sourceCandidateCount: simulation.sourceCandidateCount,
      eligibleCandidateCount: simulation.eligibleCandidateCount,
      shortlistCount: simulation.shortlistCount,
      candidates: simulation.candidates,
    }),
  );
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

async function readInput(
  request: Request,
): Promise<
  | { ok: true; value: AdminRecommendationSimulationRequest }
  | { ok: false; error: string }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "요청 본문을 확인해주세요." };
  }

  if (!isRecord(body) || !isRecord(body.answers)) {
    return { ok: false, error: "추천 응답을 입력해주세요." };
  }

  const { movement, air, density } = body.answers;
  if (
    typeof movement !== "string" ||
    !movementAnswers.has(movement as MovementAnswer) ||
    typeof air !== "string" ||
    !airAnswers.has(air as AirAnswer) ||
    typeof density !== "string" ||
    !densityAnswers.has(density as DensityAnswer)
  ) {
    return { ok: false, error: "추천 응답 값이 올바르지 않아요." };
  }

  const value: AdminRecommendationSimulationRequest = {
    answers: {
      movement: movement as MovementAnswer,
      air: air as AirAnswer,
      density: density as DensityAnswer,
    },
  };

  if (body.location !== undefined) {
    if (!isRecord(body.location)) {
      return { ok: false, error: "출발 위치를 확인해주세요." };
    }
    const latitude = Number(body.location.latitude);
    const longitude = Number(body.location.longitude);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return { ok: false, error: "위도와 경도를 확인해주세요." };
    }
    value.location = { latitude, longitude };
  }

  if (body.preferredRegion !== undefined) {
    if (
      !isRecord(body.preferredRegion) ||
      typeof body.preferredRegion.areaCode !== "string" ||
      typeof body.preferredRegion.name !== "string"
    ) {
      return { ok: false, error: "선호 지역을 확인해주세요." };
    }
    value.preferredRegion = {
      areaCode: body.preferredRegion.areaCode,
      name: body.preferredRegion.name,
    };
  }

  if (typeof body.stateText === "string" && body.stateText.trim()) {
    value.stateText = body.stateText.trim().slice(0, 500);
  }

  return { ok: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
