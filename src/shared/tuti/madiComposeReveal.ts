/** 나들이와 책장에서 아래로 끌어 작성할 때 사용하는 같은 모션 기준. */
export const MADI_COMPOSE_REVEAL = { distance: 140, offset: 34, commitMs: 120, cancelMs: 240 } as const;

export function madiComposeRevealProgress(distance: number) {
  return Math.max(0, Math.min(distance / MADI_COMPOSE_REVEAL.distance, 1));
}

export function madiComposeRevealStyle(progress: number) {
  const value = Math.max(0, Math.min(progress, 1));
  return { opacity: value, transform: `translateY(${-MADI_COMPOSE_REVEAL.offset * (1 - value)}px)` };
}
