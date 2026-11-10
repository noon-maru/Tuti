type Origin = { owner: string; entryId: string; historyLength: number };
let origin: Origin | null = null;
let unwatch: (() => void) | null = null;

function clear() { origin = null; unwatch?.(); unwatch = null; }

/** Only an actual list → detail navigation may traverse history. Direct URLs never do. */
export function rememberMadiDetailOrigin(owner: string | undefined, entryId: string) {
  clear();
  if (!owner || typeof window === "undefined") return;
  origin = { owner, entryId, historyLength: window.history.length };
  window.addEventListener("popstate", clear);
  window.addEventListener("pagehide", clear);
  unwatch = () => { window.removeEventListener("popstate", clear); window.removeEventListener("pagehide", clear); };
}

export function resolveMadiDetailReturn(owner: string | undefined, entryId: string | null) {
  const back = Boolean(owner && entryId && origin?.owner === owner && origin.entryId === entryId
    && typeof window !== "undefined" && window.history.length === origin.historyLength + 1);
  clear();
  return { back, path: "/madi" };
}
