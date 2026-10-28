const KEY = "__tutiHarumadi";
type Marker = { owner: string; token: number };
type HistoryHost = {
  history: Pick<History, "state" | "pushState" | "replaceState" | "back">;
  location: Pick<Location, "href">;
  addEventListener: (name: "popstate", listener: () => void) => void;
  removeEventListener: (name: "popstate", listener: () => void) => void;
};

/** Next.js의 라우터 상태·주소는 그대로 두고 책 펼치기만 히스토리 한 단계로 다룬다. */
export function createHarumadiHistory<T>(host: HistoryHost, owner: string, change: (value: T | null) => void) {
  const href = host.location.href;
  const books = new Map<number, T>();
  let sequence = 0, closing = false;
  const state = () => host.history.state && typeof host.history.state === "object" ? host.history.state : {};
  const marker = (): Marker | undefined => state()[KEY];
  const strip = () => {
    const next = { ...state() }; delete next[KEY]; host.history.replaceState(next, "");
  };
  // 새 실행·계정에서는 예전 실행의 책 내용을 복원하지 않는다.
  if (marker()) strip();
  const pop = () => {
    closing = false;
    const current = marker();
    const book = host.location.href === href && current?.owner === owner ? books.get(current.token) : undefined;
    change(book ?? null);
  };
  host.addEventListener("popstate", pop);
  return {
    open(value: T) {
      closing = false;
      const token = ++sequence;
      books.set(token, value);
      host.history.pushState({ ...state(), [KEY]: { owner, token } }, "");
      change(value);
    },
    close() {
      if (closing) return;
      change(null);
      const current = marker();
      if (host.location.href === href && current?.owner === owner && books.has(current.token)) {
        closing = true; host.history.back();
      }
    },
    dispose() {
      host.removeEventListener("popstate", pop);
      if (marker()?.owner === owner) strip();
      books.clear();
    },
  };
}
