import { randomUUID } from "node:crypto";
import { authenticateUser } from "@/server/auth/session";
import { recordRecommendationRunSafely } from "@/server/recommendations/run";
import { createRecommendations } from "@/server/recommendations/service";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/shared/api/recommendations";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import type {
  IntakeAnswers,
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";
import { tourApiSidoOptions } from "@/shared/tourism/tourApiRegions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const body = parseRecommendationRequest(await request.json());
    const location = body.location;
    const preferredRegion = location ? undefined : body.preferredRegion;
    const excludePlaceIds = body.excludePlaceIds ?? [];
    const stateText = body.stateText;
    const recommendationId = randomUUID();
    const places = await createRecommendations(
      body.answers ?? {},
      location,
      stateText,
      preferredRegion,
      excludePlaceIds,
    );
    const response: RecommendationResponse = {
      recommendationId,
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      places,
    };

    const user = await authenticateUser(request);
    if (user) {
      await recordRecommendationRunSafely({
        id: recommendationId,
        userId: user.id,
        request: body,
        places,
        locationUsed: Boolean(location),
        stateTextUsed: Boolean(stateText),
      });
    }

    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    const invalidRequest = error instanceof InvalidRecommendationRequestError;

    if (!invalidJson && !invalidRequest) {
      console.error("추천 API 처리 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : invalidRequest
              ? error.message
              : "추천 데이터를 준비하지 못했어요.",
        },
        { status: invalidJson || invalidRequest ? 400 : 500 },
      ),
    );
  }
}

class InvalidRecommendationRequestError extends Error {}

function parseRecommendationRequest(value: unknown): RecommendationRequest {
  if (!isRecord(value)) {
    throw new InvalidRecommendationRequestError(
      "추천 요청 형식을 확인해주세요.",
    );
  }

  assertOnlyKeys(value, [
    "answers",
    "location",
    "preferredRegion",
    "excludePlaceIds",
    "stateText",
    "entryStatus",
  ]);

  return {
    answers: normalizeAnswers(value.answers),
    location: normalizeLocation(value.location),
    preferredRegion: normalizePreferredRegion(value.preferredRegion),
    excludePlaceIds: normalizeExcludedPlaceIds(value.excludePlaceIds),
    stateText: normalizeStateText(value.stateText),
    entryStatus: normalizeEntryStatus(value.entryStatus),
  };
}

function normalizeAnswers(value: unknown): IntakeAnswers {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new InvalidRecommendationRequestError(
      "상태 답변 형식을 확인해주세요.",
    );
  }

  assertOnlyKeys(value, [
    "movement",
    "air",
    "density",
    "longDistanceTiming",
  ]);

  const answers: IntakeAnswers = {
    movement: normalizeOptionalEnum(
      value.movement,
      ["near", "short", "half", "far"],
      "이동 가능 시간",
    ),
    air: normalizeOptionalEnum(
      value.air,
      ["quiet", "open", "walk"],
      "필요한 공기",
    ),
    density: normalizeOptionalEnum(
      value.density,
      ["quiet", "balanced", "lively"],
      "선호 분위기",
    ),
    longDistanceTiming: normalizeOptionalEnum(
      value.longDistanceTiming,
      ["tomorrow_day_trip", "overnight_trip"],
      "장거리 출발 시점",
    ),
  };

  if (
    answers.longDistanceTiming !== undefined &&
    answers.movement !== "far"
  ) {
    throw new InvalidRecommendationRequestError(
      "장거리 출발 시점은 오늘 하루를 선택했을 때만 사용할 수 있어요.",
    );
  }

  return answers;
}

function normalizeExcludedPlaceIds(placeIds: unknown) {
  if (placeIds === undefined) return [];
  if (
    !Array.isArray(placeIds) ||
    placeIds.some((placeId) => typeof placeId !== "string")
  ) {
    throw new InvalidRecommendationRequestError(
      "제외 장소 목록을 확인해주세요.",
    );
  }

  return Array.from(
    new Set(
      placeIds
        .filter((placeId): placeId is string => typeof placeId === "string")
        .map((placeId) => placeId.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function normalizePreferredRegion(
  region: unknown,
): PreferredRegion | undefined {
  if (region === undefined) return undefined;
  if (
    !isRecord(region) ||
    typeof region.areaCode !== "string" ||
    typeof region.name !== "string"
  ) {
    throw new InvalidRecommendationRequestError(
      "선택한 지역을 확인해주세요.",
    );
  }
  assertOnlyKeys(region, ["areaCode", "name"]);

  const matched = tourApiSidoOptions.find(
    ([areaCode]) => areaCode === region.areaCode,
  );

  if (!matched) {
    throw new InvalidRecommendationRequestError(
      "선택한 지역을 확인해주세요.",
    );
  }

  return { areaCode: matched[0], name: matched[1] };
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeLocation(location: unknown): UserLocation | undefined {
  if (location === undefined) return undefined;
  if (!isRecord(location)) {
    throw new InvalidRecommendationRequestError(
      "현재 위치를 확인해주세요.",
    );
  }
  assertOnlyKeys(location, ["latitude", "longitude"]);

  const { latitude, longitude } = location;
  const isValidLatitude =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90;
  const isValidLongitude =
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;

  if (!isValidLatitude || !isValidLongitude) {
    throw new InvalidRecommendationRequestError(
      "현재 위치를 확인해주세요.",
    );
  }

  return { latitude, longitude };
}

function normalizeStateText(stateText: unknown) {
  if (stateText === undefined) return undefined;
  if (typeof stateText !== "string") {
    throw new InvalidRecommendationRequestError(
      "현재 상태 문장을 확인해주세요.",
    );
  }

  const trimmed = stateText.trim();

  return trimmed ? trimmed.slice(0, 400) : undefined;
}

function normalizeEntryStatus(value: unknown) {
  return normalizeOptionalEnum(
    value,
    ["answered", "reused", "skipped"],
    "상태 입력 방식",
  );
}

function normalizeOptionalEnum<const Value extends string>(
  value: unknown,
  options: readonly Value[],
  label: string,
): Value | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && options.includes(value as Value)) {
    return value as Value;
  }

  throw new InvalidRecommendationRequestError(`${label} 값을 확인해주세요.`);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const unknownKey = Object.keys(value).find(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKey) {
    throw new InvalidRecommendationRequestError(
      `알 수 없는 요청 항목(${unknownKey})이 있어요.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
