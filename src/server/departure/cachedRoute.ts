import { createHash } from "node:crypto";
import { memoizeLocationRequest } from "@/server/location/requestScope";
import { fetchKakaoMapRoute } from "@/server/maps/kakaoMapClient";
import { fetchKakaoDrivingRoute } from "@/server/maps/kakaoNaviClient";
import type {
  DepartureRoute,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

type RouteInput = {
  origin: UserLocation;
  destination: UserLocation;
  destinationName: string;
};

export function fetchCachedRoute(
  mode: DepartureRouteMode,
  input: RouteInput,
): Promise<DepartureRoute> {
  const key = createRouteCacheKey(mode, input.origin, input.destination);
  return memoizeLocationRequest(key, () => mode === "driving"
    ? fetchKakaoDrivingRoute(input)
    : fetchKakaoMapRoute(mode, input)
  );
}

function createRouteCacheKey(
  mode: DepartureRouteMode,
  origin: UserLocation,
  destination: UserLocation,
) {
  const location = [origin, destination]
    .map(({ latitude, longitude }) =>
      `${latitude.toFixed(4)},${longitude.toFixed(4)}`)
    .join("|");
  return createHash("sha256").update(`${mode}:${location}`).digest("hex");
}
