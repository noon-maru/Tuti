/** 표시 배율이 있는 PC 목업에서도 손가락 이동과 같은 거리만큼 화면을 내린다. */
export function madiComposePullOffset(distance: number, displayedHeight: number, layoutHeight: number) {
  const height = Math.max(1, layoutHeight);
  const scale = displayedHeight > 0 ? height / displayedHeight : 1;
  return Math.max(0, Math.min(height, distance * scale));
}

/** 놓은 위치에서 확정/취소 방향으로 이어 간다. 취소된 애니메이션은 절대 진입을 완료하지 않는다. */
export function settleMadiComposePull(node: HTMLElement | null, opening: boolean, onComplete: () => void, reducedMotion = false) {
  let active = true, completed = false;
  let animation: Animation | undefined;
  const finish = () => { if (active && !completed) { completed = true; onComplete(); } };
  const cancel = () => { active = false; animation?.cancel(); };
  if (!node || reducedMotion || typeof node.animate !== "function") { finish(); return cancel; }
  try {
    animation = node.animate([{ transform: getComputedStyle(node).transform }, { transform: opening ? "translateY(0)" : "translateY(-100%)" }],
      { duration: opening ? 320 : 220, easing: "cubic-bezier(.22,.75,.22,1)", fill: "forwards" });
    void animation.finished.then(finish).catch(finish);
  } catch { finish(); }
  return cancel;
}
