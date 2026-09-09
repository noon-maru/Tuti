import { prisma } from "@/server/db/prisma";
import { fetchKakaoMapRoute } from "@/server/maps/kakaoMapClient";
import { fetchKakaoDrivingRoute } from "@/server/maps/kakaoNaviClient";
import { isWalkingDistance } from "@/server/departure/routeSelection";
import { toTravelTimeSummary } from "@/server/departure/travelTimeSummary";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import type { DepartureRoute } from "@/shared/api/departurePlan";
import type { TravelTimeSummary } from "@/shared/api/travelTime";
import type { UserLocation } from "@/shared/tuti/types";

export async function createTravelTimeSummary(
  placeId: string,
  origin: UserLocation,
): Promise<TravelTimeSummary | null> {
  const place = await prisma.place.findFirst({
    where: {
      ...recommendablePlaceWhere,
      id: placeId,
    },
    select: {
      name: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!place) return null;

  const destination = {
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  };
  const input = { origin, destination, destinationName: place.name };
  const endpoints = { origin, destination };
  const walkingDistance = isWalkingDistance(origin, destination);

  if (walkingDistance) {
    const walking = await settleRoute(() =>
      fetchKakaoMapRoute("walking", input),
    );
    const summary = toTravelTimeSummary(walking, endpoints);
    if (summary) return summary;
  }

  const publicTransit = await settleRoute(() =>
    fetchKakaoMapRoute("publicTransit", input),
  );
  const transitSummary = toTravelTimeSummary(publicTransit, endpoints);
  if (transitSummary) return transitSummary;

  const driving = await settleRoute(() => fetchKakaoDrivingRoute(input));
  const drivingSummary = toTravelTimeSummary(driving, endpoints);
  if (drivingSummary) return drivingSummary;

  const bicycle = await settleRoute(() =>
    fetchKakaoMapRoute("bicycle", input),
  );
  const bicycleSummary = toTravelTimeSummary(bicycle, endpoints);
  if (bicycleSummary) return bicycleSummary;

  return null;
}

async function settleRoute(fetcher: () => Promise<DepartureRoute>) {
  try {
    return await fetcher();
  } catch (error) {
    console.warn("메인 카드 이동 시간을 불러오지 못했습니다.", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}
