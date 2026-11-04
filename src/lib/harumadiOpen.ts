import type { HarumadiBookRect } from "@/shared/harumadi/transitionGeometry";

/** 펼친 두 쪽을 회전 없이 확대하고 첫 쪽 읽기로 연결한다. */
export function animateHarumadiSpreadOpen(book: HTMLElement, contents: HTMLElement | null,
  origin: HarumadiBookRect, target: HarumadiBookRect, onComplete: () => void, reducedMotion = false) {
  let active = true, completed = false;
  const animations: Animation[] = [];
  const finish = () => { if (active && !completed) { completed = true; onComplete(); } };
  const cancel = () => { active = false; animations.forEach(animation => animation.cancel()); };
  if (reducedMotion || typeof book.animate !== "function") { finish(); return cancel; }
  try {
    const zoom = book.animate([
      { transform: `translate(${origin.x - target.x}px, ${origin.y - target.y}px) scale(${origin.width / target.width}, ${origin.height / target.height})`, opacity: 1, offset: 0 },
      { transform: "translate(0, 0) scale(1)", opacity: 1, offset: .78 },
      { transform: "translate(0, 0) scale(1)", opacity: 0, offset: 1 },
    ], { duration: 820, easing: "cubic-bezier(.22,.68,.2,1)", fill: "both" });
    animations.push(zoom);
    if (typeof contents?.animate === "function") animations.push(contents.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 240, delay: 580, fill: "backwards" }));
    void zoom.finished.then(finish).catch(finish);
  } catch { finish(); }
  return cancel;
}

/** The canonical cover grows out of the shelf, then turns away from the pages. */
export function animateHarumadiOpen(book: HTMLElement, cover: HTMLElement, contents: HTMLElement | null,
  origin: HarumadiBookRect, target: HarumadiBookRect, onComplete: () => void, reducedMotion = false) {
  let active = true, completed = false;
  const animations: Animation[] = [];
  const finish = () => { if (active && !completed) { completed = true; onComplete(); } };
  const cancel = () => { active = false; animations.forEach(animation => animation.cancel()); };
  if (reducedMotion || typeof cover.animate !== "function" || typeof book.animate !== "function") { finish(); return cancel; }
  try {
    animations.push(book.animate([
      { transform: `translate(${origin.x - target.x}px, ${origin.y - target.y}px) scale(${origin.width / target.width}, ${origin.height / target.height})`, opacity: .4 },
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
    ], { duration: 520, easing: "cubic-bezier(.22,.68,.2,1)", fill: "backwards" }));
    if (typeof contents?.animate === "function") animations.push(contents.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 360, delay: 340, fill: "backwards" }));
    const turning = cover.animate([
      { transform: "perspective(1100px) rotateY(0deg)", opacity: 1, offset: 0 },
      { transform: "perspective(1100px) rotateY(-82deg)", opacity: 1, offset: .78 },
      { transform: "perspective(1100px) rotateY(-105deg)", opacity: 0, offset: 1 },
    ], { duration: 680, delay: 160, easing: "cubic-bezier(.3,0,.2,1)", fill: "both" });
    animations.push(turning);
    void turning.finished.then(finish).catch(finish);
  } catch { finish(); }
  return cancel;
}
