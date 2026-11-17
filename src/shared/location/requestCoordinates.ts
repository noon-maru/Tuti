import type { UserLocation } from "@/shared/tuti/types";

/** 기기 내 이동 판정 메타데이터는 전송하지 않고 API 계약의 두 좌표만 보낸다. */
export function requestCoordinates(location: UserLocation): Pick<UserLocation, "latitude" | "longitude"> {
  return { latitude: location.latitude, longitude: location.longitude };
}
