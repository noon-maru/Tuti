export const OUTING_ACTIONS = [
  ["place_selected", "장소 선택"], ["departure_peek_opened", "출발 준비 확인"],
  ["departure_plan_expanded", "출발 정보 펼침"], ["navigation_started", "길찾기 시작"],
  ["return_confirmed", "방문 자기보고"], ["journal_created", "마디 저장 연결 관측"],
] as const;
/** The actions are already scoped to their occurrence period, not the recommendation creation date. */
export function summarizeOutingActions(actions: Array<{ journeyId: string; action: string }>) {
  return OUTING_ACTIONS.map(([action, label]) => ({ action, label, journeys: new Set(actions.filter(item => item.action === action).map(item => item.journeyId)).size }));
}
