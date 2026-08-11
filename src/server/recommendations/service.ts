import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { interpretStateWithLlm } from "@/server/llm/stateInterpreter";
import {
  calculateMovementFatigue,
  rankByMovementFatigue,
  scoreBreakdown,
  type FatigueBreakdown,
} from "@/server/recommendations/fatigue";
import { enrichPlacesWithCrowdForecast } from "@/server/recommendations/crowdForecast";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import { createLongDistanceRecommendations } from "@/server/recommendations/longDistancePlanner";
import {
  requireLongDistanceRecommendations,
  requireNearbyMovement,
} from "@/server/recommendations/longDistanceAvailability";
import { fetchKakaoMapRoute } from "@/server/maps/kakaoMapClient";
import { isWalkingDistance } from "@/server/departure/routeSelection";
import { toTravelTimeSummary } from "@/server/departure/travelTimeSummary";
import {
  enrichPlacesWithAdmissionFees,
  enrichPlacesWithExecutionFeasibility,
} from "@/server/recommendations/executionFeasibility";
import { enrichPlacesWithWeatherForecast } from "@/server/weather/kmaVilageForecast";
import { selectRecommendationCandidatePool } from "@/server/recommendations/candidateFallback";
import { getPreferredRegionWhere } from "@/server/recommendations/regionFallback";
import type {
  IntakeAnswers,
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";

type PlaceRow = {
  id: string;
  name: string;
  phrase: string;
  note: string;
  image: string;
  travelTime: string;
  crowd: string;
  today: string;
  fatigue: number;
  movementLevel: "near" | "short" | "half";
  moodTags: string[];
  sourceContentType: string | null;
  latitude: unknown;
  longitude: unknown;
  distanceMeters?: number | null;
};

export async function createRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  stateText?: string,
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
): Promise<TutiPlace[]> {
  const evaluation = await evaluateRecommendations(
    answers,
    location,
    stateText,
    preferredRegion,
    excludePlaceIds,
  );

  return evaluation.recommendedPlaces;
}

export type RecommendationSimulationCandidate = {
  place: TutiPlace;
  selected: boolean;
  initialRank: number | null;
  finalRank: number;
  breakdown: FatigueBreakdown;
};

export type RecommendationSimulation = {
  feature: Awaited<ReturnType<typeof interpretStateWithLlm>>;
  sourceCandidateCount: number;
  eligibleCandidateCount: number;
  shortlistCount: number;
  recommendedPlaces: TutiPlace[];
  candidates: RecommendationSimulationCandidate[];
};

export async function simulateRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  stateText?: string,
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
): Promise<RecommendationSimulation> {
  const evaluation = await evaluateRecommendations(
    answers,
    location,
    stateText,
    preferredRegion,
    excludePlaceIds,
  );
  const selectedIds = new Set(
    evaluation.recommendedPlaces.map((place) => place.id),
  );
  const initialRanks = new Map(
    evaluation.initialRanking.map((place, index) => [place.id, index + 1]),
  );

  return {
    feature: evaluation.feature,
    sourceCandidateCount: evaluation.sourceCandidateCount,
    eligibleCandidateCount: evaluation.eligibleCandidateCount,
    shortlistCount: evaluation.finalRanking.length,
    recommendedPlaces: evaluation.recommendedPlaces,
    candidates: evaluation.finalRanking.map((place, index) => {
      const breakdown = calculateMovementFatigue(
        place,
        answers,
        evaluation.feature,
      );

      return {
        place: { ...place, fatigueScore: scoreBreakdown(breakdown) },
        selected: selectedIds.has(place.id),
        initialRank: initialRanks.get(place.id) ?? null,
        finalRank: index + 1,
        breakdown,
      };
    }),
  };
}

async function evaluateRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  stateText?: string,
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
) {
  const feature = await interpretStateWithLlm({ answers, stateText });
  if (feature.movement === "far" && location) {
    const longDistancePlaces = requireLongDistanceRecommendations(
      await createLongDistanceRecommendations(
        answers,
        location,
        excludePlaceIds,
      ),
    );

    const admissionEnrichedPlaces =
      await enrichPlacesWithAdmissionFees(longDistancePlaces);
    const weatherEnrichedPlaces =
      await enrichPlacesWithWeatherForecast(admissionEnrichedPlaces);
    const conditionedPlaces = answers.companion || answers.budget
      ? rankByMovementFatigue(
          weatherEnrichedPlaces,
          answers,
          feature,
          weatherEnrichedPlaces.length,
        )
      : weatherEnrichedPlaces;
    return {
      feature,
      sourceCandidateCount: longDistancePlaces.length,
      eligibleCandidateCount: longDistancePlaces.length,
      initialRanking: conditionedPlaces,
      finalRanking: conditionedPlaces,
      recommendedPlaces: conditionedPlaces.slice(0, 6),
    };
  }

  const places = location
    ? await findPlacesNearLocation(
        location,
        requireNearbyMovement(feature.movement),
      )
    : await findPlacesByBaseFatigue(preferredRegion);

  const { eligiblePlaces, candidatePlaces: recommendationPlaces } =
    selectRecommendationCandidatePool(places, excludePlaceIds);
  const rankedPlaces = rankByMovementFatigue(
    recommendationPlaces.map(toTutiPlace),
    answers,
    feature,
    recommendationPlaces.length,
  );
  const shortlist = location
    ? rankByMovementFatigue(
        await enrichWithTransitTimes(
          selectDiverseContentTypes(rankedPlaces, 12, 4),
          location,
        ),
        answers,
        feature,
        12,
      )
    : selectDiverseContentTypes(rankedPlaces, 12, 3);
  const executionEnrichedPlaces =
    await enrichPlacesWithExecutionFeasibility(shortlist, {
      ...answers,
      movement: feature.movement,
    });
  const weatherEnrichedPlaces =
    await enrichPlacesWithWeatherForecast(executionEnrichedPlaces);
  const forecastedPlaces =
    await enrichPlacesWithCrowdForecast(weatherEnrichedPlaces);
  const finalRanking = rankByMovementFatigue(
    forecastedPlaces,
    answers,
    feature,
    12,
  );

  const recommendedPlaces = location
    ? finalRanking.slice(0, 6)
    : selectDiverseContentTypes(finalRanking, 6, 2);

  return {
    feature,
    sourceCandidateCount: places.length,
    eligibleCandidateCount: eligiblePlaces.length,
    initialRanking: rankedPlaces,
    finalRanking,
    recommendedPlaces,
  };
}

async function findPlacesByBaseFatigue(
  preferredRegion?: PreferredRegion,
): Promise<PlaceRow[]> {
  return prisma.place.findMany({
    where: {
      ...recommendablePlaceWhere,
      ...(preferredRegion
        ? getPreferredRegionWhere(preferredRegion)
        : {}),
    },
    orderBy: [{ fatigue: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      phrase: true,
      note: true,
      image: true,
      travelTime: true,
      crowd: true,
      today: true,
      fatigue: true,
      movementLevel: true,
      moodTags: true,
      sourceContentType: true,
      latitude: true,
      longitude: true,
    },
  });
}

async function findPlacesNearLocation(
  location: UserLocation,
  movement: "near" | "short" | "half",
): Promise<PlaceRow[]> {
  const { latitude, longitude } = location;
  const targetDistanceMeters = {
    near: 1_500,
    short: 7_000,
    half: 25_000,
  }[movement];

  return prisma.$queryRaw<PlaceRow[]>`
    SELECT
      "id",
      "name",
      "phrase",
      "note",
      "image",
      "travel_time" AS "travelTime",
      "crowd",
      "today",
      "fatigue",
      "movement_level" AS "movementLevel",
      "mood_tags" AS "moodTags",
      "source_content_type" AS "sourceContentType",
      "latitude",
      "longitude",
      ST_Distance(
        "location"::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters"
    FROM "places"
    WHERE
      "is_active" = true
      AND "source" = 'tourapi'
      AND "review_status" = 'approved'::"PlaceReviewStatus"
      AND (
        "candidate_override" = 'include'::"PlaceCandidateOverride"
        OR (
          "candidate_override" = 'auto'::"PlaceCandidateOverride"
          AND "candidate_status" = 'selected'::"PlaceCandidateStatus"
        )
      )
    ORDER BY
      ABS(
        ST_Distance(
          "location"::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) - ${targetDistanceMeters}
      ),
      "fatigue" ASC,
      "id" ASC
    LIMIT 180
  `;
}

function toTutiPlace(place: PlaceRow): TutiPlace {
  return {
    id: place.id,
    name: place.name,
    phrase: place.phrase,
    note: place.note,
    image: place.image,
    travelTime: place.travelTime,
    crowd: place.crowd,
    today: place.today,
    fatigue: place.fatigue,
    movementLevel: place.movementLevel,
    moodTags: place.moodTags,
    sourceContentType: place.sourceContentType ?? undefined,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    distanceMeters:
      typeof place.distanceMeters === "number" ? place.distanceMeters : undefined,
  };
}

function selectDiverseContentTypes(
  places: TutiPlace[],
  limit: number,
  maxPerType: number,
) {
  const selected: TutiPlace[] = [];
  const selectedIds = new Set<string>();
  const typeCounts = new Map<string, number>();

  for (const place of places) {
    const contentType = place.sourceContentType ?? "unknown";
    const count = typeCounts.get(contentType) ?? 0;
    if (count >= maxPerType) continue;

    selected.push(place);
    selectedIds.add(place.id);
    typeCounts.set(contentType, count + 1);
    if (selected.length === limit) return selected;
  }

  for (const place of places) {
    if (selectedIds.has(place.id)) continue;
    selected.push(place);
    if (selected.length === limit) break;
  }

  return selected;
}

async function enrichWithTransitTimes(
  places: TutiPlace[],
  origin: UserLocation,
) {
  return mapWithConcurrency(places, 6, async (place) => {
    if (
      !Number.isFinite(place.latitude) ||
      !Number.isFinite(place.longitude)
    ) {
      return place;
    }

    const destination = {
      latitude: place.latitude!,
      longitude: place.longitude!,
    };
    const mode = isWalkingDistance(origin, destination)
      ? "walking"
      : "publicTransit";
    const route = await fetchKakaoMapRoute(mode, {
      origin,
      destination,
      destinationName: place.name,
    }).catch(() => null);
    const travelTimeSummary = toTravelTimeSummary(route);

    return travelTimeSummary
      ? { ...place, travelTimeSummary }
      : place;
  });
}

async function mapWithConcurrency<Input, Output>(
  items: Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<Output>,
) {
  const results = new Array<Output>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      worker,
    ),
  );
  return results;
}
