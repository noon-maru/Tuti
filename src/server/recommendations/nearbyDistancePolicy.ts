import type { MovementAnswer } from "@/shared/tuti/types";

type NearbyMovement = Exclude<MovementAnswer, "far">;

// 직선거리 상한으로 희소 지역의 원거리 후보 유입을 먼저 막고,
// 실제 왕복 소요시간 검사는 경로 조회 후 더 엄격하게 적용한다.
const nearbyDistancePolicy: Record<
  NearbyMovement,
  { targetMeters: number; maximumMeters: number }
> = {
  // 이동 여유는 후보의 최대 탐색 반경으로만 사용한다.
  // 초기 추천은 가까운 후보부터 고르고 실제 경로 시간은 카드가 보인 뒤 확인한다.
  near: { targetMeters: 0, maximumMeters: 5_000 },
  short: { targetMeters: 0, maximumMeters: 20_000 },
  half: { targetMeters: 0, maximumMeters: 60_000 },
};

export function getNearbyDistancePolicy(movement: NearbyMovement) {
  return nearbyDistancePolicy[movement];
}

export function getNearbyMinimumDistanceMeters(
  transport: "transit" | "car" | undefined,
) {
  return transport === "car" ? 2_000 : 0;
}
