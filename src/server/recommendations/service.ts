import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { interpretStateWithLlm } from "@/server/llm/stateInterpreter";
import { rankByMovementFatigue } from "@/server/recommendations/fatigue";
import { enrichPlacesWithCrowdForecast } from "@/server/recommendations/crowdForecast";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import { fetchKakaoMapRoute } from "@/server/maps/kakaoMapClient";
import type { TravelTimeSummary } from "@/shared/api/travelTime";
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
  const feature = await interpretStateWithLlm({ answers, stateText });
  const places = location
    ? await findPlacesNearLocation(location, feature.movement)
    : await findPlacesByBaseFatigue(preferredRegion?.areaCode);

  const excludedPlaceIdSet = new Set(excludePlaceIds);
  const eligiblePlaces = places.filter(
    (place) => !excludedPlaceIdSet.has(place.id),
  );
  const recommendationPlaces = eligiblePlaces.length >= 6
    ? eligiblePlaces
    : places;
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
  const forecastedPlaces = await enrichPlacesWithCrowdForecast(shortlist);
  const finalRanking = rankByMovementFatigue(
    forecastedPlaces,
    answers,
    feature,
    location ? 6 : 12,
  );

  return location
    ? finalRanking
    : selectDiverseContentTypes(finalRanking, 6, 2);
}

async function findPlacesByBaseFatigue(
  preferredAreaCode?: string,
): Promise<PlaceRow[]> {
  return prisma.place.findMany({
    where: {
      ...recommendablePlaceWhere,
      ...(preferredAreaCode
        ? { sourceAreaCode: preferredAreaCode }
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
      AND "review_status" <> 'rejected'::"PlaceReviewStatus"
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

    const route = await fetchKakaoMapRoute("publicTransit", {
      origin,
      destination: {
        latitude: place.latitude!,
        longitude: place.longitude!,
      },
      destinationName: place.name,
    }).catch(() => null);
    const travelTimeSummary: TravelTimeSummary | undefined =
      route?.status === "available" && route.durationSeconds !== null
        ? {
            mode: route.mode,
            durationSeconds: route.durationSeconds,
            distanceMeters: route.distanceMeters,
          }
        : undefined;

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
