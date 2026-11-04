const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 선택한 책의 양끝 20%는 옆 책 이동, 가운데와 키보드 클릭은 읽기다. */
export function carouselTapDirection(clientX: number, bounds: { left: number; width: number }, keyboard = false): -1 | 0 | 1 {
  if (keyboard || bounds.width <= 0) return 0;
  const position = (clientX - bounds.left) / bounds.width;
  return position < .2 ? -1 : position > .8 ? 1 : 0;
}

export function carouselIndex(ids: string[], selection: { id: string | null; index: number }) {
  const found = selection.id ? ids.indexOf(selection.id) : -1;
  return found >= 0 ? found : clamp(selection.index, 0, Math.max(0, ids.length - 1));
}

/** 손가락 이동량은 실제 뷰포트 너비로 정규화해 PC 목업 배율과 무관하게 한다. */
export function carouselDragProgress(dx: number, width: number, index: number, count: number) {
  const progress = clamp(-dx / Math.max(1, width * .24), -1, 1);
  return (index === 0 && progress < 0) || (index === count - 1 && progress > 0) ? progress * .18 : progress;
}

export function carouselSwipeDirection(dx: number, width: number, elapsed: number): -1 | 0 | 1 {
  if (Math.abs(dx) < Math.min(48, Math.max(28, width * .12)) && !(Math.abs(dx) >= 12 && Math.abs(dx) / Math.max(1, elapsed) > .45)) return 0;
  return dx < 0 ? 1 : -1;
}

/** x는 선반 너비의 비율. 책이 많아져도 화면에는 주변 세 권까지만 합성한다. */
export function carouselPose(distance: number) {
  const depth = Math.abs(distance), near = Math.min(depth, 1), far = Math.max(0, Math.min(depth - 1, 1));
  return {
    x: Math.sign(distance) * (near * .24 + far * .105 + Math.max(0, depth - 2) * .06),
    scale: Math.max(.65, 1 - near * .16 - far * .09 - Math.max(0, depth - 2) * .05),
    rotation: -Math.sign(distance) * Math.min(38, depth * 26),
    opacity: depth > 2 ? Math.max(0, (3 - depth) * .76) : 1 - depth * .12,
    zIndex: 100 - Math.round(depth * 20),
  };
}
