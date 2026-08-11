import { prisma } from "../src/server/db/prisma";

process.env.TUTI_TRANSPORT_DEBUG = "1";

const { createLongDistanceRecommendations } = await import(
  "../src/server/recommendations/longDistancePlanner"
);

try {
  const places = await createLongDistanceRecommendations(
    { movement: "far", air: "open", density: "quiet" },
    { latitude: 37.5665, longitude: 126.978 },
    [],
  );
  console.log(
    "장거리 계획 결과",
    places.map((place) => ({
      place: place.name,
      route: place.longDistanceJourney
        ? `${place.longDistanceJourney.originHub.name}->${place.longDistanceJourney.destinationHub.name}`
        : null,
    })),
  );
} finally {
  await prisma.$disconnect();
}
