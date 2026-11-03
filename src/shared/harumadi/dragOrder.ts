export type OrderSlot = { id: string; top: number; height: number };

export function dragOrderScale(viewportHeight: number, layoutHeight: number) {
  const scale = viewportHeight / layoutHeight;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** 애니메이션 중인 시각적 위치가 아니라 실제 레이아웃의 중앙으로 삽입 위치를 정한다. */
export function dragOrderTarget(slots: readonly OrderSlot[], draggedId: string, centerY: number) {
  return slots.filter(slot => slot.id !== draggedId && centerY > slot.top + slot.height / 2).length;
}

export function dragOrderTop(y: number, grabOffset: number, height: number, top: number, bottom: number) {
  return Math.max(top, Math.min(Math.max(top, bottom - height), y - grabOffset));
}

export function dragScrollDelta(y: number, top: number, bottom: number) {
  if (y < top + 48) return -Math.min(12, Math.max(2, (top + 48 - y) / 4));
  if (y > bottom - 48) return Math.min(12, Math.max(2, (y - bottom + 48) / 4));
  return 0;
}
