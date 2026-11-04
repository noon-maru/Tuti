export type HarumadiBookRect = { x: number; y: number; width: number; height: number; appearance?: "spread" };
type Bounds = { left: number; top: number; width: number; height: number };

/** 두 쪽을 한 쪽 폭으로 늘리지 않고 원래 중심에서 화면 안에 들어갈 만큼만 확대한다. */
export function harumadiSpreadZoomTarget(origin: HarumadiBookRect, width: number, height: number): HarumadiBookRect {
  const ratio = 296 / 210;
  const nextWidth = Math.max(1, Math.min(origin.width * 1.16, width - 32, (height - 32) * ratio));
  const nextHeight = nextWidth / ratio;
  return { x: (width - nextWidth) / 2, y: Math.max(16, Math.min(height - nextHeight - 16, origin.y + origin.height / 2 - nextHeight / 2 - 8)),
    width: nextWidth, height: nextHeight };
}

/** Convert viewport rectangles back to CSS coordinates inside a scaled app. */
export function harumadiLocalRect(container: Bounds, target: Bounds, layoutWidth: number, layoutHeight: number): HarumadiBookRect {
  const scaleX = container.width > 0 && layoutWidth > 0 ? container.width / layoutWidth : 1;
  const scaleY = container.height > 0 && layoutHeight > 0 ? container.height / layoutHeight : 1;
  return { x: (target.left - container.left) / scaleX, y: (target.top - container.top) / scaleY,
    width: target.width / scaleX, height: target.height / scaleY };
}
