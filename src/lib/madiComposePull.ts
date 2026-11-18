import { MADI_COMPOSE_REVEAL, madiComposeRevealStyle } from "@/shared/tuti/madiComposeReveal";

/** PC 목업의 표시 배율을 보정해 동일한 드래그 진행률을 사용한다. */
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
    const current = getComputedStyle(node);
    animation = node.animate([{ transform: current.transform, opacity: current.opacity }, madiComposeRevealStyle(opening ? 1 : 0)],
      { duration: opening ? MADI_COMPOSE_REVEAL.commitMs : MADI_COMPOSE_REVEAL.cancelMs, easing: "ease", fill: "forwards" });
    void animation.finished.then(finish).catch(finish);
  } catch { finish(); }
  return cancel;
}
