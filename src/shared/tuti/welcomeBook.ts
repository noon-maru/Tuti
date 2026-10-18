export const WELCOME_BOOK_PAGE_COUNT = 4;
export const WELCOME_BOOK_LAST_PAGE = 3;
export type WelcomeBookPage = 0 | 1 | 2 | 3;
export type WelcomeBookOrigin = { left: number; top: number; width: number; height: number };

export function welcomeBookNeighbor(page: WelcomeBookPage, direction: -1 | 1): WelcomeBookPage | null {
  const next = page + direction;
  return next < 0 || next > WELCOME_BOOK_LAST_PAGE ? null : next as WelcomeBookPage;
}

export function welcomeBookTurn(previous: WelcomeBookPage, next: WelcomeBookPage) {
  const forward = next > previous;
  const frames = [
    { offset: 0, transform: "perspective(1200px) rotateY(0deg)", opacity: 1 },
    { offset: 0.45, transform: "perspective(1200px) rotateY(-8deg)", opacity: 0.65 },
    { offset: 1, transform: "perspective(1200px) rotateY(-18deg)", opacity: 0 },
  ];
  return {
    phase: forward ? "exit" as const : "enter" as const,
    transformOrigin: "left top",
    frames: forward ? frames : frames.slice().reverse().map((frame) => ({ ...frame, offset: 1 - frame.offset })),
    duration: 520,
    // Time-reverse the easing as well as the keyframes.
    easing: forward ? "cubic-bezier(0.4, 0, 0.2, 1)" : "cubic-bezier(0.8, 0, 0.6, 1)",
  };
}

export function parseWelcomeBookPage(mode: string | null, page: string | null): WelcomeBookPage | null {
  if (mode !== "book") return null;
  return page === "0" ? 0 : page === "2" ? 2 : page === "3" ? 3 : 1;
}

export function welcomeBookPath(page: WelcomeBookPage, fromGuide = false) {
  return `/entry?mode=book&page=${page}${fromGuide ? "&from=guide" : ""}`;
}
