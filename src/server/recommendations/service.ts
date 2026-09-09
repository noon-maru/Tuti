import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { interpretState } from "@/lib/recommendations";
import {
  personalizeRecommendationRanking,
  type PersonalizationAudit,
} from "@/server/personalization/ranking";
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
  requireLocationForLongDistance,
  requireLongDistanceRecommendations,
  requireNearbyMovement,
} from "@/server/recommendations/longDistanceAvailability";
import { fetchKakaoMapRoute } from "@/server/maps/kakaoMapClient";
import { isWalkingDistance } from "@/server/departure/routeSelection";
import { toTravelTimeSummary } from "@/server/departure/travelTimeSummary";
import { getExternalLocationProcessingMode } from "@/server/location/externalProcessing";
import {
  enrichPlacesWithAdmissionFees,
  enrichPlacesWithExecutionFeasibility,
} from "@/server/recommendations/executionFeasibility";
import { filterPlacesByAdmissionBudget } from "@/server/recommendations/admissionFee";
import { enrichPlacesWithWeatherForecast } from "@/server/weather/kmaVilageForecast";
import { selectRecommendationCandidatePool } from "@/server/recommendations/candidateFallback";
import { selectDiverseContentTypes } from "@/server/recommendations/diverseCandidateSelection";
import { getPreferredRegionWhere } from "@/server/recommendations/regionFallback";
import {
  excludeExplicitlyInfeasiblePlaces,
  keepVerifiedTimeFits,
} from "@/server/recommendations/executionEligibility";
import { derivePlaceMoodTags } from "@/server/tourism/placeMoodTags";
import { getNearbyDistancePolicy } from "@/server/recommendations/nearbyDistancePolicy";
import {
  filterPlacesByRequestedDensity,
  filterPlacesByRequestedMood,
} from "@/server/recommendations/moodEligibility";
import {
  toPublicPlaceName,
  toPublicSidoName,
} from "@/server/places/publicPlaceLabels";
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
  sourceSidoName: string | null;
  sourceSigunguName: string | null;
  sourceAddress: string | null;
  visibilityOverride: "auto" | "show" | "hide";
  detailOverview?: string | null;
  detailExperienceGuide?: string | null;
  tourismSourceRecord?: {
    detailRecord?: {
      overview: string | null;
      experienceGuide: string | null;
    } | null;
  } | null;
  latitude: unknown;
  longitude: unknown;
  distanceMeters?: number | null;
};

const RECOMMENDATION_LIMIT = 6;
const CANDIDATE_EVALUATION_BATCH_SIZE = 12;
const MAX_LOCATION_EVALUATION_BATCHES = 2;

export async function createRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
  userId?: string,
): Promise<TutiPlace[]> {
  const evaluation = await evaluateRecommendations(
    answers,
    location,
    preferredRegion,
    excludePlaceIds,
    userId,
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
  feature: ReturnType<typeof interpretState>;
  sourceCandidateCount: number;
  eligibleCandidateCount: number;
  shortlistCount: number;
  recommendedPlaces: TutiPlace[];
  candidates: RecommendationSimulationCandidate[];
};

export async function simulateRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
): Promise<RecommendationSimulation> {
  const evaluation = await evaluateRecommendations(
    answers,
    location,
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
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
  userId?: string,
) {
  // 오늘 사용자가 명시적으로 고른 값은 항상 결정론적으로 해석한다.
  // LLM 프로필은 아래의 후보 순위 보정 단계에서만 비동기로 활용된다.
  const feature = interpretState(answers);
  requireLocationForLongDistance(feature.movement, location);

  if (
    feature.movement === "far" &&
    location &&
    getExternalLocationProcessingMode() !== "pending"
  ) {
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
    const budgetEligiblePlaces = filterPlacesByAdmissionBudget(
      weatherEnrichedPlaces,
      answers.budget,
    );
    const conditionedPlaces = rankByMovementFatigue(
      budgetEligiblePlaces,
      answers,
      feature,
      budgetEligiblePlaces.length,
    );
    const personalization = await personalizeRecommendationRanking(
      conditionedPlaces,
      answers,
      userId,
    );
    return {
      feature,
      sourceCandidateCount: longDistancePlaces.length,
      eligibleCandidateCount: budgetEligiblePlaces.length,
      initialRanking: conditionedPlaces,
      finalRanking: personalization.places,
      recommendedPlaces: personalization.places.slice(0, RECOMMENDATION_LIMIT),
      personalization: personalization.audit,
    };
  }

  const places = location
    ? await findPlacesNearLocation(
        location,
        feature.movement === "far"
          ? "half"
          : requireNearbyMovement(feature.movement),
      )
    : await findPlacesByBaseFatigue(preferredRegion);

  const { eligiblePlaces, candidatePlaces: recommendationPlaces } =
    selectRecommendationCandidatePool(places, excludePlaceIds);
  const rankedPlaces = rankByMovementFatigue(
    filterPlacesByRequestedMood(
      recommendationPlaces.map(toTutiPlace),
      answers.air,
    ),
    answers,
    feature,
    recommendationPlaces.length,
  );
  const evaluatedPlaceIds = new Set<string>();
  const eligibleShortlist: TutiPlace[] = [];
  const evaluationBatchCount = location
    ? MAX_LOCATION_EVALUATION_BATCHES
    : 1;

  for (let batchIndex = 0; batchIndex < evaluationBatchCount; batchIndex += 1) {
    const candidateBatch = selectDiverseContentTypes(
      rankedPlaces,
      CANDIDATE_EVALUATION_BATCH_SIZE,
      location ? 4 : 3,
      evaluatedPlaceIds,
    );
    if (candidateBatch.length === 0) break;
    candidateBatch.forEach((place) => evaluatedPlaceIds.add(place.id));

    const routeEnrichedBatch = location
      ? rankByMovementFatigue(
          await enrichWithTransitTimes(candidateBatch, location),
          answers,
          feature,
          CANDIDATE_EVALUATION_BATCH_SIZE,
        )
      : candidateBatch;
    const executionEnrichedBatch =
      await enrichPlacesWithExecutionFeasibility(routeEnrichedBatch, {
        ...answers,
        movement: feature.movement,
      });
    const executableBatch = location
      ? keepVerifiedTimeFits(executionEnrichedBatch)
      : excludeExplicitlyInfeasiblePlaces(executionEnrichedBatch);
    eligibleShortlist.push(
      ...filterPlacesByAdmissionBudget(executableBatch, answers.budget),
    );

    if (eligibleShortlist.length >= RECOMMENDATION_LIMIT) break;
  }

  const weatherEnrichedPlaces =
    await enrichPlacesWithWeatherForecast(eligibleShortlist);
  const forecastedPlaces =
    await enrichPlacesWithCrowdForecast(weatherEnrichedPlaces);
  const finalRanking = rankByMovementFatigue(
    filterPlacesByRequestedDensity(forecastedPlaces, answers.density),
    answers,
    feature,
    12,
  );
  const personalization = await personalizeRecommendationRanking(
    finalRanking,
    answers,
    userId,
  );
  const recommendedPlaces = location
    ? personalization.places.slice(0, RECOMMENDATION_LIMIT)
    : selectDiverseContentTypes(
        personalization.places,
        RECOMMENDATION_LIMIT,
        2,
      );

  return {
    feature,
    sourceCandidateCount: places.length,
    eligibleCandidateCount: eligiblePlaces.length,
    initialRanking: rankedPlaces,
    finalRanking: personalization.places,
    recommendedPlaces,
    personalization: personalization.audit,
  };
}

export async function createRecommendationsWithAudit(
  answers: IntakeAnswers,
  location?: UserLocation,
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
  userId?: string,
): Promise<{ places: TutiPlace[]; personalization: PersonalizationAudit }> {
  const evaluation = await evaluateRecommendations(
    answers,
    location,
    preferredRegion,
    excludePlaceIds,
    userId,
  );
  return {
    places: evaluation.recommendedPlaces,
    personalization: evaluation.personalization,
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
      sourceSidoName: true,
      sourceSigunguName: true,
      sourceAddress: true,
      visibilityOverride: true,
      tourismSourceRecord: {
        select: {
          detailRecord: {
            select: { overview: true, experienceGuide: true },
          },
        },
      },
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
  const { targetMeters, maximumMeters } = getNearbyDistancePolicy(movement);

  return prisma.$queryRaw<PlaceRow[]>`
    SELECT
      p."id",
      p."name",
      p."phrase",
      p."note",
      p."image",
      p."travel_time" AS "travelTime",
      p."crowd",
      p."today",
      p."fatigue",
      p."movement_level" AS "movementLevel",
      p."mood_tags" AS "moodTags",
      p."source_content_type" AS "sourceContentType",
      p."source_sido_name" AS "sourceSidoName",
      p."source_sigungu_name" AS "sourceSigunguName",
      p."source_address" AS "sourceAddress",
      p."visibility_override" AS "visibilityOverride",
      d."overview" AS "detailOverview",
      d."experience_guide" AS "detailExperienceGuide",
      p."latitude",
      p."longitude",
      ST_Distance(
        p."location"::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters"
    FROM "places" p
    LEFT JOIN "tourism_place_source_records" s
      ON s."linked_place_id" = p."id"
    LEFT JOIN "tourism_place_detail_records" d
      ON d."content_id" = s."content_id"
    WHERE
      p."is_active" = true
      AND p."source" = 'tourapi'
      AND p."review_status" = 'approved'::"PlaceReviewStatus"
      AND (
        p."candidate_override" = 'include'::"PlaceCandidateOverride"
        OR (
          p."candidate_override" = 'auto'::"PlaceCandidateOverride"
          AND p."candidate_status" = 'selected'::"PlaceCandidateStatus"
        )
      )
      AND ST_DWithin(
        p."location"::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${maximumMeters}
      )
    ORDER BY
      ABS(
        ST_Distance(
          p."location"::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) - ${targetMeters}
      ),
      p."fatigue" ASC,
      p."id" ASC
    LIMIT 180
  `;
}

function toTutiPlace(place: PlaceRow): TutiPlace {
  const detail = place.tourismSourceRecord?.detailRecord;
  const moodTags = place.visibilityOverride === "auto"
    ? derivePlaceMoodTags({
        name: place.name,
        address: place.sourceAddress,
        contentTypeId: place.sourceContentType,
        overview: detail?.overview ?? place.detailOverview,
        experienceGuide:
          detail?.experienceGuide ?? place.detailExperienceGuide,
      })
    : place.moodTags;
  return {
    id: place.id,
    name: toPublicPlaceName(
      place.name,
      place.sourceSidoName,
      place.sourceSigunguName,
    ),
    phrase: place.phrase,
    note: place.note,
    image: place.image,
    travelTime: place.travelTime,
    crowd: place.crowd,
    today: place.today,
    fatigue: place.fatigue,
    movementLevel: place.movementLevel,
    moodTags,
    sourceContentType: place.sourceContentType ?? undefined,
    sourceSidoName:
      toPublicSidoName(place.sourceSidoName, place.sourceSigunguName) ??
      undefined,
    sourceSigunguName: place.sourceSigunguName ?? undefined,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    distanceMeters:
      typeof place.distanceMeters === "number" ? place.distanceMeters : undefined,
  };
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
    const travelTimeSummary = toTravelTimeSummary(route, {
      origin,
      destination,
    });

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
