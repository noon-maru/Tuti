const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 책장 전시용 크기다. 양옆은 잘라도 세로는 전시 영역 안에 둔다. 실제 지면은 바꾸지 않는다. */
export function carouselPreviewSize(width: number, height: number) {
  const spreadWidth = Math.max(1, Math.min(width * 1.35, height * 1.3, 640));
  return { spreadWidth, bookHeight: spreadWidth * 210 / 296 };
}

/** 확대되어 잘린 책도 화면에 보이는 양끝을 누를 수 있도록 교집합을 쓴다. */
export function carouselVisibleTapBounds(book: { left: number; width: number }, stage: { left: number; width: number }) {
  const left = Math.max(book.left, stage.left), right = Math.min(book.left + book.width, stage.left + stage.width);
  return { left, width: Math.max(0, right - left) };
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
  if (dx === 0) return 0;
  const progress = -dx / Math.max(1, width * .18);
  // 먼저 잘라내면 계속 끌어도 멈추므로, 이동량에 따라 저항을 늘린다.
  const rubber = (distance: number) => .75 * distance / (1.5 + distance);
  const edge = (index === 0 && progress < 0) || (index === count - 1 && progress > 0);
  if (edge) return Math.sign(progress) * rubber(Math.abs(progress));
  // 한 권 간격을 넘어도 급정지하지 않는다. 실제 선택은 옆 책 한 권으로 제한한다.
  return Math.abs(progress) <= 1 ? progress : Math.sign(progress) * (1 + rubber(Math.abs(progress) - 1));
}

export function carouselSwipeDirection(dx: number, width: number, elapsed: number): -1 | 0 | 1 {
  if (Math.abs(dx) < Math.min(32, Math.max(20, width * .075)) && !(Math.abs(dx) >= 12 && Math.abs(dx) / Math.max(1, elapsed) > .45)) return 0;
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

/** 한 번의 드래그는 옆 책까지만 순서를 바꾸고, 초과 당김은 묶음 전체 이동으로 표현한다. */
export function carouselDraggedPose(offset: number, drag: number, index: number, count: number) {
  const selectionProgress = clamp(drag, Math.max(-1, -index), Math.min(1, Math.max(0, count - index - 1)));
  const pose = carouselPose(offset - selectionProgress);
  const progress = Math.abs(selectionProgress);
  const blend = progress * progress * (3 - 2 * progress);
  // 깊이 순서를 중간에 뒤집는 대신, 현재 책을 앞에서 서서히 걷어 옆 책을 드러낸다.
  const departing = offset === 0 && progress > 0;
  return { ...pose, x: pose.x - (drag - selectionProgress) * .24,
    opacity: departing ? pose.opacity * (1 - blend) : pose.opacity,
    zIndex: departing && progress < 1 ? 101 : pose.zIndex };
}
