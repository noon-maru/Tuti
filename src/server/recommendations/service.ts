import type { PlaceVisitTimeProfile, TutiPlace } from "@/lib/recommendations";
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
  toDisplayFatigueScore,
  type FatigueBreakdown,
} from "@/server/recommendations/fatigue";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import { createLongDistanceRecommendations } from "@/server/recommendations/longDistancePlanner";
import {
  requireLocationForLongDistance,
  requireLongDistanceRecommendations,
  requireNearbyMovement,
} from "@/server/recommendations/longDistanceAvailability";
import { getExternalLocationProcessingMode } from "@/server/location/externalProcessing";
import {
  enrichPlacesWithAdmissionFees,
  enrichPlacesWithKnownExecutionFeasibility,
  type OperationDetail,
} from "@/server/recommendations/executionFeasibility";
import { filterPlacesByAdmissionBudget } from "@/server/recommendations/admissionFee";
import { enrichPlacesWithWeatherForecast } from "@/server/weather/kmaVilageForecast";
import { selectRecommendationCandidatePool } from "@/server/recommendations/candidateFallback";
import { collectEligibleCandidatesInBatches } from "@/server/recommendations/adaptiveCandidateEvaluation";
import { selectDiverseExperienceTypes } from "@/server/recommendations/diverseCandidateSelection";
import { getPreferredRegionWhere } from "@/server/recommendations/regionFallback";
import { excludeExplicitlyInfeasiblePlaces } from "@/server/recommendations/executionEligibility";
import { derivePlaceMoodTags } from "@/server/tourism/placeMoodTags";
import { derivePlaceExperienceType } from "@/server/recommendations/experienceType";
import {
  selectDiverseRecommendations,
  selectDiverseRecommendationsWithBackfill,
} from "@/server/recommendations/finalDiversity";
import {
  getNearbyDistancePolicy,
  getNearbyMinimumDistanceMeters,
} from "@/server/recommendations/nearbyDistancePolicy";
import {
  filterPlacesByRequestedDensity,
  prioritizePlacesByRequestedMood,
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
  experienceType: string | null;
  sourceContentType: string | null;
  sourceSidoName: string | null;
  sourceSigunguName: string | null;
  sourceAddress: string | null;
  visibilityOverride: "auto" | "show" | "hide";
  visitTimeProfile?: PlaceVisitTimeProfile | null;
  visitStayMinimumMinutes?: number | null;
  visitStayTypicalMinutes?: number | null;
  visitStayMaximumMinutes?: number | null;
  visitStaySource?: string | null;
  visitStayFlexibility?: string | null;
  visitParkingAvailability?: string | null;
  visitCarSuitability?: string | null;
  visitEntryProcess?: string | null;
  visitReservationRequirement?: string | null;
  visitAccessConstraint?: string | null;
  visitParkingBufferMinimumMinutes?: number | null;
  visitParkingBufferTypicalMinutes?: number | null;
  visitParkingBufferMaximumMinutes?: number | null;
  visitEntryBufferMinimumMinutes?: number | null;
  visitEntryBufferTypicalMinutes?: number | null;
  visitEntryBufferMaximumMinutes?: number | null;
  visitConfidence?: number | null;
  visitProfileVersion?: string | null;
  detailOverview?: string | null;
  detailExperienceGuide?: string | null;
  tourismSourceRecord?: {
    detailRecord?: {
      overview: string | null;
      experienceGuide: string | null;
      openingHours: string | null;
      restDate: string | null;
      admissionFee: string | null;
    } | null;
  } | null;
  detailOpeningHours?: string | null;
  detailRestDate?: string | null;
  detailAdmissionFee?: string | null;
  latitude: unknown;
  longitude: unknown;
  distanceMeters?: number | null;
};

const RECOMMENDATION_LIMIT = 6;
const FINAL_RERANK_POOL_SIZE = 12;
const INITIAL_LOCATION_EVALUATION_BATCH_SIZE = 6;
const SUPPLEMENTAL_EVALUATION_BATCH_SIZE = 12;
const INITIAL_LOCATION_EXPERIENCE_TYPE_CAP = 2;
const MAX_LOCATION_EVALUATION_BATCHES = 2;
const MAX_NEAR_LOCATION_EVALUATION_BATCHES = 4;

export async function createRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  preferredRegion?: PreferredRegion,
  excludePlaceIds: string[] = [],
  userId?: string,
  preferencePlaceIds: string[] = [],
): Promise<TutiPlace[]> {
  const evaluation = await evaluateRecommendations(
    answers,
    location,
    preferredRegion,
    excludePlaceIds,
    userId,
    preferencePlaceIds,
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
      const rankingScore = scoreBreakdown(breakdown);

      return {
        place: {
          ...place,
          rankingScore,
          fatigueScore: toDisplayFatigueScore(rankingScore),
        },
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
  preferencePlaceIds: string[] = [],
) {
  // 오늘 사용자가 명시적으로 고른 값은 항상 결정론적으로 해석한다.
  // LLM 프로필은 아래의 후보 순위 보정 단계에서만 비동기로 활용된다.
  const feature = interpretState(answers);
  const effectiveExcludedPlaceIds = Array.from(
    new Set([...excludePlaceIds, ...preferencePlaceIds]),
  );
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
        effectiveExcludedPlaceIds,
      ),
    );

    const [admissionEnrichedPlaces, weatherEnrichedPlaces] = await Promise.all([
      enrichPlacesWithAdmissionFees(longDistancePlaces),
      enrichPlacesWithWeatherForecast(longDistancePlaces),
    ]);
    const enrichedPlaces = mergePlaceEnrichments(
      admissionEnrichedPlaces,
      weatherEnrichedPlaces,
    );
    const budgetEligiblePlaces = filterPlacesByAdmissionBudget(
      enrichedPlaces,
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
      preferencePlaceIds,
    );
    return {
      feature,
      sourceCandidateCount: longDistancePlaces.length,
      eligibleCandidateCount: budgetEligiblePlaces.length,
      initialRanking: conditionedPlaces,
      finalRanking: personalization.places,
      recommendedPlaces: selectDiverseRecommendations(
        personalization.places,
        RECOMMENDATION_LIMIT,
      ),
      personalization: personalization.audit,
    };
  }

  const places = location
    ? await findPlacesNearLocation(
        location,
        feature.movement === "far"
          ? "half"
          : requireNearbyMovement(feature.movement),
        answers.transport,
      )
    : await findPlacesByBaseFatigue(preferredRegion);

  const { eligiblePlaces, candidatePlaces, fallbackPlaces } =
    selectRecommendationCandidatePool(places, excludePlaceIds);
  const operationDetailByPlaceId = new Map(
    places.map((place) => [place.id, toOperationDetail(place)] as const),
  );
  const preferencePlaceIdSet = new Set(preferencePlaceIds);
  const recommendationPlaces = candidatePlaces.filter(
    (place) => !preferencePlaceIdSet.has(place.id),
  );
  const fallbackRecommendationPlaces = fallbackPlaces.filter(
    (place) => !preferencePlaceIdSet.has(place.id),
  );
  const rankCandidatePlaces = (candidateRows: PlaceRow[]) =>
    prioritizePlacesByRequestedMood(
      rankByMovementFatigue(
        candidateRows.map(toTutiPlace),
        answers,
        feature,
        candidateRows.length,
      ),
      answers.air,
    );
  const rankedPlaces = rankCandidatePlaces(recommendationPlaces);
  const rankedFallbackPlaces = rankCandidatePlaces(
    fallbackRecommendationPlaces,
  );
  const evaluatedPlaceIds = new Set<string>();
  const eligibleShortlist: TutiPlace[] = [];
  const evaluationBatchCount = location
    ? feature.movement === "near"
      ? MAX_NEAR_LOCATION_EVALUATION_BATCHES
      : MAX_LOCATION_EVALUATION_BATCHES
    : 1;

  const evaluateCandidateRanking = async (
    ranking: TutiPlace[],
    maximumBatchCount: number,
    targetCount: number,
  ) => {
    const remainingTargetCount = Math.max(
      0,
      targetCount - eligibleShortlist.length,
    );
    if (remainingTargetCount === 0) return;

    const newlyEligiblePlaces = await collectEligibleCandidatesInBatches({
      maximumBatchCount,
      targetCount: remainingTargetCount,
      initialBatchSize: location
        ? INITIAL_LOCATION_EVALUATION_BATCH_SIZE
        : FINAL_RERANK_POOL_SIZE,
      supplementalBatchSize: SUPPLEMENTAL_EVALUATION_BATCH_SIZE,
      selectBatch: (batchSize) => {
        const maxPerExperienceType = location
          ? batchSize === INITIAL_LOCATION_EVALUATION_BATCH_SIZE
            ? INITIAL_LOCATION_EXPERIENCE_TYPE_CAP
            : 4
          : 3;
        const candidateBatch = selectDiverseExperienceTypes(
          ranking,
          batchSize,
          maxPerExperienceType,
          evaluatedPlaceIds,
        );
        candidateBatch.forEach((place) => evaluatedPlaceIds.add(place.id));
        return candidateBatch;
      },
      evaluateBatch: async (candidateBatch) => {
        const executionEnrichedBatch = enrichPlacesWithKnownExecutionFeasibility(
          candidateBatch,
          {
            ...answers,
            movement: feature.movement,
          },
          operationDetailByPlaceId,
        );
        const executableBatch = excludeExplicitlyInfeasiblePlaces(
          executionEnrichedBatch,
        );
        return filterPlacesByAdmissionBudget(executableBatch, answers.budget);
      },
    });
    eligibleShortlist.push(...newlyEligiblePlaces);
  };

  await evaluateCandidateRanking(
    rankedPlaces,
    evaluationBatchCount,
    location ? RECOMMENDATION_LIMIT : FINAL_RERANK_POOL_SIZE,
  );

  if (
    eligibleShortlist.length < RECOMMENDATION_LIMIT &&
    rankedFallbackPlaces.length > 0
  ) {
    await evaluateCandidateRanking(
      rankedFallbackPlaces,
      evaluationBatchCount,
      RECOMMENDATION_LIMIT,
    );
  }

  const rerankedPlaces = prioritizePlacesByRequestedMood(
    rankByMovementFatigue(
      filterPlacesByRequestedDensity(eligibleShortlist, answers.density),
      answers,
      feature,
      eligibleShortlist.length,
    ),
    answers.air,
  );
  const previousPlaceIdSet = new Set(excludePlaceIds);
  const finalRanking = [
    ...rerankedPlaces
      .filter((place) => !previousPlaceIdSet.has(place.id))
      .slice(0, FINAL_RERANK_POOL_SIZE),
    ...rerankedPlaces
      .filter((place) => previousPlaceIdSet.has(place.id))
      .slice(0, FINAL_RERANK_POOL_SIZE),
  ];
  const personalization = await personalizeRecommendationRanking(
    finalRanking,
    answers,
    userId,
    preferencePlaceIds,
  );
  const recommendedPlaces = selectDiverseRecommendationsWithBackfill(
    personalization.places,
    excludePlaceIds,
    RECOMMENDATION_LIMIT,
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
  preferencePlaceIds: string[] = [],
): Promise<{ places: TutiPlace[]; personalization: PersonalizationAudit }> {
  const evaluation = await evaluateRecommendations(
    answers,
    location,
    preferredRegion,
    excludePlaceIds,
    userId,
    preferencePlaceIds,
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
    take: 180,
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
      experienceType: true,
      sourceContentType: true,
      sourceSidoName: true,
      sourceSigunguName: true,
      sourceAddress: true,
      visibilityOverride: true,
      visitTimeProfile: {
        select: {
          stayMinimumMinutes: true,
          stayTypicalMinutes: true,
          stayMaximumMinutes: true,
          staySource: true,
          stayFlexibility: true,
          parkingAvailability: true,
          carSuitability: true,
          entryProcess: true,
          reservationRequirement: true,
          accessConstraint: true,
          parkingBufferMinimumMinutes: true,
          parkingBufferTypicalMinutes: true,
          parkingBufferMaximumMinutes: true,
          entryBufferMinimumMinutes: true,
          entryBufferTypicalMinutes: true,
          entryBufferMaximumMinutes: true,
          confidence: true,
          profileVersion: true,
        },
      },
      tourismSourceRecord: {
        select: {
          detailRecord: {
            select: {
              overview: true,
              experienceGuide: true,
              openingHours: true,
              restDate: true,
              admissionFee: true,
            },
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
  transport: IntakeAnswers["transport"],
): Promise<PlaceRow[]> {
  const { latitude, longitude } = location;
  const { targetMeters, maximumMeters } = getNearbyDistancePolicy(movement);
  const minimumMeters = getNearbyMinimumDistanceMeters(transport);

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
      p."experience_type" AS "experienceType",
      p."source_content_type" AS "sourceContentType",
      p."source_sido_name" AS "sourceSidoName",
      p."source_sigungu_name" AS "sourceSigunguName",
      p."source_address" AS "sourceAddress",
      p."visibility_override" AS "visibilityOverride",
      v."stay_minimum_minutes" AS "visitStayMinimumMinutes",
      v."stay_typical_minutes" AS "visitStayTypicalMinutes",
      v."stay_maximum_minutes" AS "visitStayMaximumMinutes",
      v."stay_source" AS "visitStaySource",
      v."stay_flexibility" AS "visitStayFlexibility",
      v."parking_availability" AS "visitParkingAvailability",
      v."car_suitability" AS "visitCarSuitability",
      v."entry_process" AS "visitEntryProcess",
      v."reservation_requirement" AS "visitReservationRequirement",
      v."access_constraint" AS "visitAccessConstraint",
      v."parking_buffer_minimum_minutes" AS "visitParkingBufferMinimumMinutes",
      v."parking_buffer_typical_minutes" AS "visitParkingBufferTypicalMinutes",
      v."parking_buffer_maximum_minutes" AS "visitParkingBufferMaximumMinutes",
      v."entry_buffer_minimum_minutes" AS "visitEntryBufferMinimumMinutes",
      v."entry_buffer_typical_minutes" AS "visitEntryBufferTypicalMinutes",
      v."entry_buffer_maximum_minutes" AS "visitEntryBufferMaximumMinutes",
      v."confidence" AS "visitConfidence",
      v."profile_version" AS "visitProfileVersion",
      d."overview" AS "detailOverview",
      d."experience_guide" AS "detailExperienceGuide",
      d."opening_hours" AS "detailOpeningHours",
      d."rest_date" AS "detailRestDate",
      d."admission_fee" AS "detailAdmissionFee",
      p."latitude",
      p."longitude",
      distance."distanceMeters"
    FROM "places" p
    LEFT JOIN "tourism_place_source_records" s
      ON s."linked_place_id" = p."id"
    LEFT JOIN "tourism_place_detail_records" d
      ON d."content_id" = s."content_id"
    LEFT JOIN "place_visit_time_profiles" v
      ON v."place_id" = p."id"
    CROSS JOIN LATERAL (
      SELECT ST_Distance(
        p."location"::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters"
    ) distance
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
      AND (
        ${minimumMeters} = 0
        OR NOT ST_DWithin(
          p."location"::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${minimumMeters}
        )
      )
    ORDER BY
      ABS(distance."distanceMeters" - ${targetMeters}),
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
    experienceType: isPlaceExperienceType(place.experienceType)
      ? place.experienceType
      : derivePlaceExperienceType({
          name: place.name,
          phrase: place.phrase,
          note: place.note,
          sourceContentType: place.sourceContentType ?? undefined,
          moodTags,
          overview: detail?.overview ?? place.detailOverview,
          experienceGuide:
            detail?.experienceGuide ?? place.detailExperienceGuide,
        }),
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    distanceMeters:
      typeof place.distanceMeters === "number" ? place.distanceMeters : undefined,
    visitTimeProfile: toVisitTimeProfile(place) ?? undefined,
  };
}

function toVisitTimeProfile(place: PlaceRow): PlaceVisitTimeProfile | null {
  if (place.visitTimeProfile) return place.visitTimeProfile;
  if (
    place.visitStayMinimumMinutes == null ||
    place.visitStayTypicalMinutes == null ||
    place.visitStayMaximumMinutes == null ||
    place.visitStaySource == null ||
    place.visitStayFlexibility == null ||
    place.visitParkingAvailability == null ||
    place.visitCarSuitability == null ||
    place.visitEntryProcess == null ||
    place.visitReservationRequirement == null ||
    place.visitAccessConstraint == null ||
    place.visitParkingBufferMinimumMinutes == null ||
    place.visitParkingBufferTypicalMinutes == null ||
    place.visitParkingBufferMaximumMinutes == null ||
    place.visitEntryBufferMinimumMinutes == null ||
    place.visitEntryBufferTypicalMinutes == null ||
    place.visitEntryBufferMaximumMinutes == null ||
    place.visitConfidence == null ||
    place.visitProfileVersion == null
  ) return null;

  return {
    stayMinimumMinutes: place.visitStayMinimumMinutes,
    stayTypicalMinutes: place.visitStayTypicalMinutes,
    stayMaximumMinutes: place.visitStayMaximumMinutes,
    staySource: place.visitStaySource,
    stayFlexibility: place.visitStayFlexibility,
    parkingAvailability: place.visitParkingAvailability,
    carSuitability: place.visitCarSuitability,
    entryProcess: place.visitEntryProcess,
    reservationRequirement: place.visitReservationRequirement,
    accessConstraint: place.visitAccessConstraint,
    parkingBufferMinimumMinutes: place.visitParkingBufferMinimumMinutes,
    parkingBufferTypicalMinutes: place.visitParkingBufferTypicalMinutes,
    parkingBufferMaximumMinutes: place.visitParkingBufferMaximumMinutes,
    entryBufferMinimumMinutes: place.visitEntryBufferMinimumMinutes,
    entryBufferTypicalMinutes: place.visitEntryBufferTypicalMinutes,
    entryBufferMaximumMinutes: place.visitEntryBufferMaximumMinutes,
    confidence: place.visitConfidence,
    profileVersion: place.visitProfileVersion,
  };
}

function toOperationDetail(place: PlaceRow): OperationDetail {
  const detail = place.tourismSourceRecord?.detailRecord;
  return {
    openingHours: detail?.openingHours ?? place.detailOpeningHours ?? null,
    restDate: detail?.restDate ?? place.detailRestDate ?? null,
    admissionFee: detail?.admissionFee ?? place.detailAdmissionFee ?? null,
  };
}

function isPlaceExperienceType(
  value: string | null,
): value is NonNullable<TutiPlace["experienceType"]> {
  return value !== null && [
    "waterside",
    "forest_garden",
    "art_exhibition",
    "museum_story",
    "history_heritage",
    "viewpoint",
    "neighborhood",
    "activity",
    "wellness",
    "other",
  ].includes(value);
}

function mergePlaceEnrichments(
  primary: TutiPlace[],
  secondary: TutiPlace[],
) {
  const secondaryById = new Map(secondary.map((place) => [place.id, place]));
  return primary.map((place) => ({
    ...place,
    ...secondaryById.get(place.id),
  }));
}
