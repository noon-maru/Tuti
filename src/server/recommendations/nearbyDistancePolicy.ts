import type { MovementAnswer } from "@/shared/tuti/types";

type NearbyMovement = Exclude<MovementAnswer, "far">;

// 직선거리 상한으로 희소 지역의 원거리 후보 유입을 먼저 막고,
// 실제 왕복 소요시간 검사는 경로 조회 후 더 엄격하게 적용한다.
const nearbyDistancePolicy: Record<
  NearbyMovement,
  { targetMeters: number; maximumMeters: number }
> = {
  // 한 시간 안에는 특정 거리감보다 실제로 빨리 닿는지가 중요하다.
  // 가장 가까운 후보부터 경로를 확인해 왕복·체류 60분 조건의 통과율을 높인다.
  near: { targetMeters: 0, maximumMeters: 5_000 },
  short: { targetMeters: 7_000, maximumMeters: 20_000 },
  half: { targetMeters: 25_000, maximumMeters: 60_000 },
};

export function getNearbyDistancePolicy(movement: NearbyMovement) {
  return nearbyDistancePolicy[movement];
}
