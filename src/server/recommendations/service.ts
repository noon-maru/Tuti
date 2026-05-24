import { rankRecommendations, type TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import type { IntakeAnswers } from "@/store/tuti";

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
};

export async function createRecommendations(answers: IntakeAnswers): Promise<TutiPlace[]> {
  const places = await prisma.place.findMany({
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
    },
  });

  return rankRecommendations(places.map(toTutiPlace), answers);
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
  };
}
