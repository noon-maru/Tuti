import type { MovementAnswer } from "@/shared/tuti/types";

type NearbyMovement = Exclude<MovementAnswer, "far">;

// 직선거리 상한으로 희소 지역의 원거리 후보 유입을 먼저 막고,
// 실제 왕복 소요시간 검사는 경로 조회 후 더 엄격하게 적용한다.
const nearbyDistancePolicy: Record<
  NearbyMovement,
  { targetMeters: number; maximumMeters: number }
> = {
  near: { targetMeters: 1_500, maximumMeters: 5_000 },
  short: { targetMeters: 7_000, maximumMeters: 20_000 },
  half: { targetMeters: 25_000, maximumMeters: 60_000 },
};

export function getNearbyDistancePolicy(movement: NearbyMovement) {
  return nearbyDistancePolicy[movement];
}
