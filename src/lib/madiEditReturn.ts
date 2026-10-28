type Source = "detail" | "journal";
type Origin = { owner: string; entryId: string; source: Source };
let origin: Origin | null = null;
let stopWatching: (() => void) | null = null;

function clear() {
  origin = null; stopWatching?.(); stopWatching = null;
}

/** 실제 앱 내부에서 수정 화면으로 이동했을 때만 뒤로가기를 허용한다. */
export function rememberMadiEditOrigin(owner: string | undefined, entryId: string, source: Source) {
  clear();
  if (!owner || typeof window === "undefined") return;
  origin = { owner, entryId, source };
  window.addEventListener("popstate", clear);
  window.addEventListener("pagehide", clear);
  stopWatching = () => {
    window.removeEventListener("popstate", clear);
    window.removeEventListener("pagehide", clear);
  };
}

export function resolveMadiEditReturn(owner: string | undefined, entryId: string, source: string | null) {
  const path = source === "detail" ? `/madi/detail?entryId=${encodeURIComponent(entryId)}` : "/madi";
  const back = Boolean(owner && origin?.owner === owner && origin.entryId === entryId && origin.source === source);
  clear();
  return { back, path };
}
