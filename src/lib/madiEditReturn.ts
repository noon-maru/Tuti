type Source = "detail" | "journal" | "harumadi";
type Origin = { owner: string; entryId: string; source: Source; bookId?: string };
let origin: Origin | null = null;
let stopWatching: (() => void) | null = null;

function clear() {
  origin = null; stopWatching?.(); stopWatching = null;
}

/** 실제 앱 내부에서 수정 화면으로 이동했을 때만 뒤로가기를 허용한다. */
export function rememberMadiEditOrigin(owner: string | undefined, entryId: string, source: Source, bookId?: string) {
  clear();
  if (!owner || typeof window === "undefined") return;
  origin = { owner, entryId, source, bookId };
  window.addEventListener("popstate", clear);
  window.addEventListener("pagehide", clear);
  stopWatching = () => {
    window.removeEventListener("popstate", clear);
    window.removeEventListener("pagehide", clear);
  };
}

export function resolveMadiEditReturn(owner: string | undefined, entryId: string, source: string | null, bookId?: string | null) {
  const validBook = source === "harumadi" && bookId && /^[a-zA-Z0-9_-]{1,128}$/.test(bookId);
  const bookOrigin = Boolean(validBook && owner && origin?.owner === owner && origin.entryId === entryId && origin.source === source && origin.bookId === bookId);
  const path = validBook && (bookOrigin || !origin) ? `/harumadi?harumadiId=${encodeURIComponent(bookId)}` : source === "detail" ? `/madi/detail?entryId=${encodeURIComponent(entryId)}` : "/madi";
  // 책 펼치기 이력은 이전 페이지의 메모리에 있으므로 명시적인 책 경로로 복귀한다.
  const back = Boolean(source !== "harumadi" && owner && origin?.owner === owner && origin.entryId === entryId && origin.source === source);
  clear();
  return { back, path };
}
