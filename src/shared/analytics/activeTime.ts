export const ACTIVE_HEARTBEAT_MS = 15_000;
export const ACTIVE_IDLE_MS = 60_000;
export const ACTIVE_MAX_GAP_MS = 30_000;

// 화면·최근 상호작용의 교집합만 집계한다. 긴 타이머 지연/절전 구간은 소급하지 않는다.
export function createActiveTimeTracker(emit: (owner: string, milliseconds: number, endedAt: number) => void) {
  let clock: { owner: string; at: number; interaction: number; visible: boolean } | null = null;
  let buffered = 0, endedAt = 0;
  function flush() {
    if (clock && buffered > 0) emit(clock.owner, buffered, endedAt);
    buffered = 0;
  }
  return {
    sample(now: number, owner: string | undefined, visible: boolean, interaction = false, force = false) {
      if (!owner || !Number.isFinite(now)) { clock = null; buffered = 0; return; }
      if (!clock || clock.owner !== owner || now < clock.at || now - clock.at > ACTIVE_MAX_GAP_MS) {
        const lastInteraction = clock?.owner === owner && now >= clock.at && !interaction ? clock.interaction : now;
        clock = { owner, at: now, interaction: lastInteraction, visible };
        buffered = 0;
        return;
      }
      const end = Math.min(now, clock.interaction + ACTIVE_IDLE_MS);
      const elapsed = clock.visible ? Math.max(0, end - clock.at) : 0;
      if (elapsed > 0) {
        if (buffered && endedAt !== clock.at) flush();
        buffered += elapsed;
        endedAt = end;
      }
      clock = { owner, at: now, interaction: interaction ? now : clock.interaction, visible };
      if (buffered >= ACTIVE_HEARTBEAT_MS || force || !visible || end < now) flush();
    },
    reset() { clock = null; buffered = 0; },
  };
}
