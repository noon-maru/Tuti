const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keep the book and its details together; short screens may scroll rather than shrink controls. */
export function carouselStageHeight(width: number, availableHeight: number, detailsHeight: number) {
  const preferred = Math.min(width * .88, 440) / 2 * 595.28 / 419.53 + 48;
  return Math.max(140, Math.min(preferred, availableHeight - detailsHeight - 32, 360));
}

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

/** 처음 의도가 확실해진 축만 사용해 대각선 이동의 책 넘김·작성 혼선을 막는다. */
export function carouselGestureAxis(dx: number, dy: number, canWrite: boolean): "horizontal" | "up" | "scroll" | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return null;
  if (Math.abs(dx) >= Math.abs(dy) * 1.2) return "horizontal";
  if (Math.abs(dy) >= Math.abs(dx) * 1.2) return canWrite && dy < 0 ? "up" : "scroll";
  return null;
}

export function carouselWriteProgress(dy: number, width: number) {
  return clamp(-dy / Math.max(1, Math.min(100, width * .25)), 0, 1);
}

export function carouselShouldWrite(dy: number, width: number, elapsed: number) {
  return -dy >= Math.min(80, Math.max(48, width * .2)) || (-dy >= 28 && -dy / Math.max(1, elapsed) > .55);
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
