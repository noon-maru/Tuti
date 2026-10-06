import type { RecommendationErrorKind } from "@/lib/api/recommendationError";
import type { RecommendationErrorCode } from "@/shared/api/recommendations";

export type RecommendationRecoveryAction = "retry" | "location" | "restart";
type RecoveryButton = { action: RecommendationRecoveryAction; label: string };
export type RecommendationFailure = {
  title: string;
  message: string;
  primary: RecoveryButton;
  secondary?: RecoveryButton;
};

export function getRecommendationFailure(
  kind: RecommendationErrorKind = "unknown",
  code?: RecommendationErrorCode,
): RecommendationFailure {
  if (code === "long_distance_unavailable") return {
    title: "오늘 다녀올 만한 먼 길을 찾지 못했어요.",
    message: "다녀오는 데 조금 더 여유를 내거나, 오늘은 가까운 곳부터 살펴볼까요?",
    primary: { action: "restart", label: "오늘 다시 고르기" },
    secondary: { action: "retry", label: "다시 찾아보기" },
  };
  if (code === "long_distance_location_required") return {
    title: "먼 길을 함께 살펴보려면 출발할 곳이 필요해요.",
    message: "지금 있는 곳을 알려주면, 오가는 길까지 살펴서 골라드릴게요.",
    primary: { action: "location", label: "출발할 곳 알려주기" },
    secondary: { action: "restart", label: "오늘의 여유 다시 고르기" },
  };
  if (kind === "location") return {
    title: "추천받을 위치나 지역을 확인해주세요.",
    message: "현재 위치 이용을 확인하거나 추천받을 시·군·구를 선택하면 다시 살펴볼 수 있어요.",
    primary: { action: "location", label: "위치·지역 확인하기" },
  };
  if (kind === "network") return {
    title: "추천 서버에 연결하지 못했어요.",
    message: "인터넷 연결을 확인한 뒤 다시 찾아볼까요?",
    primary: { action: "retry", label: "다시 시도하기" },
  };
  if (kind === "server") return {
    title: "추천 서비스가 잠시 응답하지 못했어요.",
    message: "위치 설정을 바꾸지 않아도 돼요. 잠시 후 다시 찾아볼까요?",
    primary: { action: "retry", label: "다시 시도하기" },
  };
  return {
    title: "오늘의 공간을 불러오지 못했어요.",
    message: "잠시 후 다시 찾아볼까요? 계속되지 않으면 오늘의 조건을 다시 선택할 수 있어요.",
    primary: { action: "retry", label: "다시 찾아보기" },
    secondary: { action: "restart", label: "오늘 다시 고르기" },
  };
}
