export type OrderSlot = { id: string; top: number; height: number };

export const ORDER_MOVE_TIMING = { duration: 420, easing: "cubic-bezier(.22,.68,.24,1)" };

/** FLIP snapshots live in list-local CSS pixels, not viewport coordinates.
 * DOM placement / scroll anchoring can move the whole list between snapshots. */
export function orderLocalTop(rowViewportTop: number, listViewportTop: number, scale: number) {
  return (rowViewportTop - listViewportTop) / scale;
}
export function orderFlipOffset(previousLocalTop: number, nextLayoutTop: number) {
  return previousLocalTop - nextLayoutTop;
}

/** Preview slots without moving DOM nodes. Preserve real row heights and grid gap. */
export function projectOrderSlots(ids: readonly string[], original: readonly OrderSlot[]): OrderSlot[] {
  const gap = original.length > 1 ? Math.max(0, original[1].top - original[0].top - original[0].height) : 0;
  const byId = new Map(original.map(slot => [slot.id, slot]));
  let top = original[0]?.top ?? 0;
  return ids.flatMap(id => {
    const slot = byId.get(id);
    if (!slot) return [];
    const result = { id, top, height: slot.height };
    top += slot.height + gap;
    return [result];
  });
}

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
