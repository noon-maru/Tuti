export const WELCOME_HARUMADI_PAGE_COUNT = 5;
export const WELCOME_HARUMADI_LAST_PAGE = 4;
export type WelcomeHarumadiPage = 0 | 1 | 2 | 3 | 4;
export type WelcomeHarumadiOrigin = { left: number; top: number; width: number; height: number };

export function welcomeHarumadiNeighbor(page: WelcomeHarumadiPage, direction: -1 | 1): WelcomeHarumadiPage | null {
  const next = page + direction;
  return next < 0 || next > WELCOME_HARUMADI_LAST_PAGE ? null : next as WelcomeHarumadiPage;
}

export function welcomeHarumadiTurn(previous: WelcomeHarumadiPage, next: WelcomeHarumadiPage) {
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

export function parseWelcomeHarumadiPage(page: string | null): WelcomeHarumadiPage {
  return page === "0" ? 0 : page === "2" ? 2 : page === "3" ? 3 : page === "4" ? 4 : 1;
}

export function welcomeHarumadiPath(page: WelcomeHarumadiPage, source: "welcome" | "library" = "welcome") {
  return `/harumadi/example?page=${page}${source === "library" ? "&from=library" : ""}`;
}
