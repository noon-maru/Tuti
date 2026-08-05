import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { interpretStateWithLlm } from "@/server/llm/stateInterpreter";
import { rankByMovementFatigue } from "@/server/recommendations/fatigue";
import { enrichPlacesWithCrowdForecast } from "@/server/recommendations/crowdForecast";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
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
  distanceMeters?: number | null;
};

export const RECOMMENDATION_ALGORITHM_VERSION = "movement-fatigue-v2";

export async function createRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  stateText?: string,
  preferredRegion?: PreferredRegion,
): Promise<TutiPlace[]> {
  const feature = await interpretStateWithLlm({ answers, stateText });
  const places = location
    ? await findPlacesNearLocation(location)
    : await findPlacesByBaseFatigue(preferredRegion?.areaCode);

  const rankedPlaces = rankByMovementFatigue(
    places.map(toTutiPlace),
    answers,
    feature,
    location ? 12 : places.length,
  );
  const shortlist = location
    ? rankedPlaces
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
    },
  });
}

async function findPlacesNearLocation(location: UserLocation): Promise<PlaceRow[]> {
  const { latitude, longitude } = location;

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
      "location" <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326),
      "fatigue" ASC,
      "id" ASC
    LIMIT 30
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
