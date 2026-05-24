import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { interpretStateWithLlm } from "@/server/llm/stateInterpreter";
import { rankByMovementFatigue } from "@/server/recommendations/fatigue";
import type { IntakeAnswers, UserLocation } from "@/store/tuti";

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
  distanceMeters?: number | null;
};

export async function createRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  stateText?: string,
): Promise<TutiPlace[]> {
  const feature = await interpretStateWithLlm({ answers, stateText });
  const places = location
    ? await findPlacesNearLocation(location)
    : await findPlacesByBaseFatigue();

  return rankByMovementFatigue(places.map(toTutiPlace), answers, feature);
}

async function findPlacesByBaseFatigue(): Promise<PlaceRow[]> {
  return prisma.place.findMany({
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
      ST_Distance(
        "location"::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters"
    FROM "places"
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
    distanceMeters:
      typeof place.distanceMeters === "number" ? place.distanceMeters : undefined,
  };
}
