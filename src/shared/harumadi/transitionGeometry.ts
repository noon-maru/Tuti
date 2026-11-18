export type HarumadiBookRect = { x: number; y: number; width: number; height: number; appearance?: "spread" };
type Bounds = { left: number; top: number; width: number; height: number };

/** 화면에 맞춰 축소하지 않고, 보고 있던 오른쪽 지면의 중심에서 확대한다. 넘친 부분은 전환 레이어에서 자른다. */
export function harumadiSpreadZoomTarget(origin: HarumadiBookRect, width: number, height: number): HarumadiBookRect {
  const ratio = 296 / 210;
  const nextWidth = Math.max(1, origin.width * 1.35, Math.max(1, width - 48) * 2);
  const nextHeight = nextWidth / ratio;
  const centerY = origin.y + origin.height / 2;
  return { x: origin.x + origin.width * .75 - nextWidth * .75,
    y: Math.max(0, Math.min(height, centerY)) - nextHeight / 2,
    width: nextWidth, height: nextHeight };
}

/** Convert viewport rectangles back to CSS coordinates inside a scaled app. */
export function harumadiLocalRect(container: Bounds, target: Bounds, layoutWidth: number, layoutHeight: number): HarumadiBookRect {
  const scaleX = container.width > 0 && layoutWidth > 0 ? container.width / layoutWidth : 1;
  const scaleY = container.height > 0 && layoutHeight > 0 ? container.height / layoutHeight : 1;
  return { x: (target.left - container.left) / scaleX, y: (target.top - container.top) / scaleY,
    width: target.width / scaleX, height: target.height / scaleY };
}
