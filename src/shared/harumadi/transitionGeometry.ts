export type HarumadiBookRect = { x: number; y: number; width: number; height: number; appearance?: "spread" };
type Bounds = { left: number; top: number; width: number; height: number };

/** Convert viewport rectangles back to CSS coordinates inside a scaled app. */
export function harumadiLocalRect(container: Bounds, target: Bounds, layoutWidth: number, layoutHeight: number): HarumadiBookRect {
  const scaleX = container.width > 0 && layoutWidth > 0 ? container.width / layoutWidth : 1;
  const scaleY = container.height > 0 && layoutHeight > 0 ? container.height / layoutHeight : 1;
  return { x: (target.left - container.left) / scaleX, y: (target.top - container.top) / scaleY,
    width: target.width / scaleX, height: target.height / scaleY };
}
