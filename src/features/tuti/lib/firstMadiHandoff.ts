import { getSessionSnapshot, subscribeToSession } from "@/lib/auth/session";

export type FirstMadiHandoffKind = "read" | "continue" | "shelf";
type Rect = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;
type Handoff = {
  kind: FirstMadiHandoffKind;
  ownerId: string;
  bookId: string;
  entryId: string;
  scene: HTMLElement;
  navigate: () => void;
};
type ActiveHandoff = Pick<Handoff, "ownerId" | "kind" | "bookId" | "scene"> & { cancel: () => void };
const easing = "cubic-bezier(.22,.75,.25,1)";
const targetAttribute = {
  read: "data-first-madi-read-target",
  continue: "data-first-madi-write-target",
  shelf: "data-first-madi-shelf-book",
} as const;
let active: ActiveHandoff | undefined;

export function firstMadiShelfArrival(ownerId: string) {
  return active?.kind === "shelf" && active.ownerId === ownerId ? active.bookId : null;
}

export function cancelFirstMadiHandoff(scene: HTMLElement | null) {
  if (!scene || active?.scene !== scene) return false;
  active.cancel();
  return true;
}

export function firstMadiHandoffTransform(from: Rect, to: Rect) {
  return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
}

function visibleRect(element: HTMLElement | null) {
  const rect = element?.getBoundingClientRect();
  return rect && rect.width > 1 && rect.height > 1 ? rect : null;
}

function arrivalTarget(root: HTMLElement, kind: FirstMadiHandoffKind, id: string) {
  const attribute = targetAttribute[kind];
  for (const node of root.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    if (node.getAttribute(attribute) !== id || node.closest("[data-first-madi-handoff]")) continue;
    if (kind !== "shelf") return node;
    if (node.hasAttribute("data-carousel-active")) {
      if (node.getAttribute("data-carousel-active") !== "true") continue;
      return node.querySelector<HTMLElement>("[data-harumadi-spread-preview]");
    }
    return node.querySelector<HTMLElement>("[data-harumadi-spine], [data-book-cover] > span");
  }
  return null;
}

/** Keep the paper inside the app frame across route commits, never in storage or in history. */
export function startFirstMadiHandoff({ scene, kind, ownerId, bookId, entryId, navigate }: Handoff) {
  if (active?.scene === scene) return;
  active?.cancel();
  const root = scene.closest<HTMLElement>("[data-app-viewport]");
  const page = scene.querySelector<HTMLElement>("[data-placement-page]");
  const source = kind === "read" ? page : scene;
  const viewport = visibleRect(root ?? null), sourceRect = visibleRect(source), pageRect = visibleRect(page);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!root || !source || !sourceRect || !viewport || !pageRect || reduced.matches || typeof source.animate !== "function"
    || getSessionSnapshot()?.userId !== ownerId || !source.isConnected || typeof MutationObserver === "undefined"
    || sourceRect.bottom <= viewport.top || sourceRect.top >= viewport.bottom) {
    navigate();
    return;
  }

  const layer = document.createElement("div");
  layer.setAttribute("data-first-madi-handoff", kind);
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  Object.assign(layer.style, { position: "absolute", inset: "0", zIndex: "45", overflow: "hidden", pointerEvents: "none" });
  const snapshot = source.cloneNode(true) as HTMLElement;
  const originX = viewport.left + root.clientLeft, originY = viewport.top + root.clientTop;
  const place = (node: HTMLElement, box: Rect) => Object.assign(node.style, {
    position: "absolute", left: `${box.left - originX}px`, top: `${box.top - originY}px`,
    width: `${box.width}px`, height: `${box.height}px`, maxWidth: "none", margin: "0", transformOrigin: "top left",
  });
  place(snapshot, sourceRect);
  layer.append(snapshot);
  root.append(layer);

  const previousVisibility = source.style.visibility;
  const screen = scene.closest<HTMLElement>("[aria-labelledby='madi-create-heading']");
  const previouslyInert = screen?.inert;
  source.style.visibility = "hidden";
  if (screen) screen.inert = true;
  const motions: Animation[] = [];
  let ended = false, frame = 0, timer = 0, deadline = 0, navigated = false, observer: MutationObserver | undefined, unsubscribe: (() => void) | undefined;
  const stopWatching = () => { observer?.disconnect(); window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  const cleanup = () => {
    if (ended) return;
    ended = true;
    if (active?.scene === scene) active = undefined;
    stopWatching();
    window.clearTimeout(deadline);
    motions.forEach(motion => motion.cancel());
    layer.remove();
    source.style.visibility = previousVisibility;
    if (screen) screen.inert = Boolean(previouslyInert);
    window.removeEventListener("popstate", cleanup);
    window.removeEventListener("pagehide", cleanup);
    window.removeEventListener("resize", finishWithoutAnimation);
    reduced.removeEventListener?.("change", finishWithoutAnimation);
    unsubscribe?.();
  };
  const go = () => {
    if (ended || navigated) return;
    navigated = true;
    try { navigate(); } catch (error) { cleanup(); throw error; }
  };
  const finishWithoutAnimation = () => { if (!ended) { go(); cleanup(); } };
  const play = (element: HTMLElement, frames: Keyframe[], duration: number, timing = easing) => {
    try {
      const motion = element.animate(frames, { duration, easing: timing, fill: "both" });
      motions.push(motion);
      return motion.finished;
    } catch (error) { return Promise.reject(error); }
  };
  const waitForArrival = () => {
    const find = () => {
      frame = 0;
      if (ended || !navigated) return;
      const target = arrivalTarget(root, kind, kind === "read" ? entryId : bookId);
      if (kind === "shelf" && target) {
        const targetBox = target.getBoundingClientRect();
        const scroller = target.closest<HTMLElement>("[data-scroll-region]");
        const bounds = scroller?.getBoundingClientRect();
        if (scroller && bounds && targetBox.top < bounds.top) scroller.scrollTop += targetBox.top - bounds.top;
        else if (scroller && bounds && targetBox.bottom > bounds.bottom) scroller.scrollTop += targetBox.bottom - bounds.bottom;
      }
      const box = visibleRect(target);
      if (!target || !box) return;
      stopWatching();
      const duration = kind === "shelf" ? 460 : kind === "read" ? 390 : 160;
      if (kind === "continue") {
        void play(layer, [{ opacity: 1 }, { opacity: 0 }], duration).then(cleanup, cleanup);
        return;
      }
      // The paper remains solid while travelling; blend only near its destination.
      void Promise.all([
        play(target, [{ opacity: 0 }, { opacity: 0, offset: .62 }, { opacity: 1 }], duration, "linear"),
        play(snapshot, [{ opacity: 1 }, { opacity: 1, offset: .62 }, { opacity: 0 }], duration, "linear"),
        play(snapshot, [
          { transform: firstMadiHandoffTransform(sourceRect, sourceRect) },
          { transform: firstMadiHandoffTransform(sourceRect, box) },
        ], duration),
      ]).then(cleanup, cleanup);
    };
    const queue = () => { if (!ended && !frame) frame = window.requestAnimationFrame(find); };
    observer = new MutationObserver(queue);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: [targetAttribute[kind], "data-carousel-active"] });
    timer = window.setTimeout(() => {
      stopWatching();
      void play(layer, [{ opacity: 1 }, { opacity: 0 }], 120).then(cleanup, cleanup);
    }, 950);
    go();
    queue();
  };

  active = { scene, ownerId, kind, bookId, cancel: cleanup };
  deadline = window.setTimeout(finishWithoutAnimation, kind === "continue" ? 2100 : 1900);
  window.addEventListener("popstate", cleanup);
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("resize", finishWithoutAnimation);
  reduced.addEventListener?.("change", finishWithoutAnimation);
  unsubscribe = subscribeToSession(() => { if (getSessionSnapshot()?.userId !== ownerId) cleanup(); });
  if (kind !== "continue") { waitForArrival(); return; }

  const blank = document.createElement("div");
  place(blank, pageRect);
  Object.assign(blank.style, { background: "var(--color-surface)", border: "1px solid var(--color-border)" });
  layer.insertBefore(blank, snapshot);
  const leaf = snapshot.querySelector<HTMLElement>("[data-placement-page]");
  if (!leaf) { finishWithoutAnimation(); return; }
  // The right leaf beneath the saved page is replaced by the blank sheet that will expand.
  snapshot.querySelector("[data-placement-under-page]")?.remove();
  const hinge = document.createElement("div");
  hinge.setAttribute("data-first-madi-turning-leaf", "");
  Object.assign(hinge.style, {
    position: "absolute", left: `${pageRect.left - sourceRect.left}px`, top: `${pageRect.top - sourceRect.top}px`,
    width: `${pageRect.width}px`, height: `${pageRect.height}px`, zIndex: "3",
    transformOrigin: "left center", transformStyle: "preserve-3d",
  });
  const face = { position: "absolute", inset: "0", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
  Object.assign(leaf.style, face, { width: "100%", height: "100%", transform: "rotateY(0deg)" });
  const reverse = document.createElement("div");
  reverse.setAttribute("data-first-madi-leaf-reverse", "");
  Object.assign(reverse.style, face, {
    transform: "rotateY(180deg)", background: "var(--color-surface)", border: "1px solid var(--color-border)",
    borderRadius: "4px 0 0 4px",
  });
  hinge.append(leaf, reverse);
  snapshot.append(hinge);
  // Keep the sheet opaque across the spine; the reverse face becomes visible after 90°.
  void play(hinge, [
    { transform: "perspective(900px) rotateY(0deg)" },
    { transform: "perspective(900px) rotateY(-180deg)" },
  ], 530, "cubic-bezier(.38,.05,.28,1)").then(() => {
    if (ended) return;
    void play(snapshot, [{ opacity: 1 }, { opacity: 0 }], 240).catch(cleanup);
    void play(blank, [
      { transform: "none", borderColor: "var(--color-border)" },
      { transform: firstMadiHandoffTransform(pageRect, viewport), borderColor: "transparent" },
    ], 320).then(() => { if (!ended) waitForArrival(); }, finishWithoutAnimation);
  }, finishWithoutAnimation);
}
