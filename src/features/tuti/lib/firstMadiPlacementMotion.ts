const parts = ["photo", "title", "content", "date", "place", "pets"] as const;
type Part = typeof parts[number];
type Point = { x: number; y: number; width: number };
export type FirstMadiOrigins = Partial<Record<Part, Point>>;
export type FirstMadiPageOrigin = Point;

const assemblyDuration = 660;
const fragmentStagger = 28;
const assembledAt = assemblyDuration + (parts.length - 1) * fragmentStagger;
const guidanceStart = assembledAt + 620;
const guidanceDuration = 600;
const guidanceReadTime = 2400;
export const FIRST_MADI_HANDOFF_MS = guidanceStart + guidanceDuration + guidanceReadTime;
export const FIRST_MADI_REDUCED_HANDOFF_MS = guidanceReadTime;
const insertionStartsAt = 1460;
export const FIRST_MADI_PLACEMENT_MS = insertionStartsAt + 850;

export function animateFirstMadiGuidance(element: HTMLElement | null) {
  if (!element || typeof element.animate !== "function") return;
  const animation = element.animate([
    { opacity: 0, transform: "translateY(26px)" },
    { opacity: 1, transform: "none" },
  ], { delay: guidanceStart, duration: guidanceDuration, fill: "backwards", easing: "cubic-bezier(.25, .55, .32, 1)" });
  return () => animation.cancel();
}

export function firstMadiOrigins(viewport: HTMLElement | null): FirstMadiOrigins {
  if (!viewport) return {};
  const bounds = viewport.getBoundingClientRect();
  const origins: FirstMadiOrigins = {};
  for (const part of parts) {
    const nodes = [...viewport.querySelectorAll(`[data-madi-source="${part}"], [data-memory-part="${part}"]`)];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
      origins[part] = { x: rect.left - bounds.left, y: Math.max(0, rect.top - bounds.top), width: rect.width };
      break;
    }
  }
  return origins;
}

export function firstMadiPageOrigin(scene: HTMLElement | null, viewport: HTMLElement | null): FirstMadiPageOrigin | null {
  const page = scene?.querySelector("[data-placement-page]")?.getBoundingClientRect();
  if (!page?.width || !viewport) return null;
  const bounds = viewport.getBoundingClientRect();
  return { x: page.left - bounds.left, y: page.top - bounds.top, width: page.width };
}

export function animateFirstMadiAssembly(scene: HTMLElement, viewport: HTMLElement, origins: FirstMadiOrigins) {
  const page = scene.querySelector<HTMLElement>("[data-placement-page]");
  const article = page?.querySelector("article");
  if (!page || !article || typeof page.animate !== "function") return;
  const bounds = viewport.getBoundingClientRect();
  const pageWidth = page.getBoundingClientRect().width;
  if (!pageWidth || !bounds.width) return;
  const animations: Animation[] = [];
  const ease = "cubic-bezier(.32, .08, .24, 1)";
  const animate = (node: Element, frames: Keyframe[], timing: KeyframeAnimationOptions) => {
    const animation = node.animate(frames, { fill: "backwards", easing: ease, ...timing });
    animations.push(animation);
  };

  // Take all measurements in the settled layout before starting any transforms.
  const fragments = parts.flatMap((part, index) => {
    const node = page.querySelector<HTMLElement>(`[data-memory-part="${part}"]`);
    if (!node) return [];
    const rect = node.getBoundingClientRect();
    const origin = origins[part];
    const x = origin ? origin.x - (rect.left - bounds.left) : (index % 2 ? 1 : -1) * pageWidth * .24;
    const y = origin ? origin.y - (rect.top - bounds.top) : 20 + index * 5;
    const scale = origin && rect.width ? Math.max(.85, Math.min(1.55, origin.width / rect.width)) : 1.12;
    return [{ node, index, origin, x, y, scale }];
  });

  for (const { node, index, origin, x, y, scale } of fragments) {
    animate(node, [{ transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: origin ? 1 : 0 },
      { transform: "none", opacity: 1 }], { duration: assemblyDuration, delay: index * fragmentStagger });
  }
  const paperDelay = 130;
  animate(article, [{ backgroundColor: "transparent", borderColor: "transparent" }, {}], { delay: paperDelay, duration: assembledAt - paperDelay });
  // The finished sheet lifts once as the line appears, then settles before the handoff measures it.
  const driftEasing = "cubic-bezier(.42, 0, .58, 1)";
  animate(page, [
    { transform: "translateY(0)", offset: 0, easing: driftEasing },
    { transform: "translateY(-12px)", offset: .44, easing: driftEasing },
    { transform: "translateY(0)", offset: 1 },
  ], { delay: guidanceStart, duration: FIRST_MADI_HANDOFF_MS - guidanceStart, fill: "none", easing: "linear" });
  return () => animations.forEach(animation => animation.cancel());
}

export function animateFirstMadiPlacement(scene: HTMLElement, viewport: HTMLElement, origin: FirstMadiPageOrigin | null, guidance?: HTMLElement | null) {
  const page = scene.querySelector<HTMLElement>("[data-placement-page]");
  const binding = scene.querySelector<HTMLElement>("[data-placement-binding]");
  const cover = scene.querySelector<HTMLElement>("[data-placement-book]");
  if (!page || !binding || !cover || typeof page.animate !== "function") return;
  const bounds = viewport.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  const pageWidth = pageRect.width;
  if (!pageWidth || !bounds.width) return;
  const initialScale = origin ? origin.width / pageWidth : 1.75;
  const startX = origin ? origin.x - (pageRect.left - bounds.left) : -pageWidth * initialScale / 2;
  const startY = origin ? origin.y - (pageRect.top - bounds.top) : 0;
  const full = `translate(${startX}px, ${startY}px) rotate(0deg) scale(${initialScale})`;
  const besideBook = `translate(${-.94 * pageWidth}px, ${-.11 * pageWidth}px) rotate(-4deg) scale(.97)`;
  const approaching = `translate(${-.84 * pageWidth}px, ${-.055 * pageWidth}px) rotate(-2deg) scale(.94)`;
  const seated = "translate(0px, 0px) rotate(0deg) scale(1)";
  const bookAppearsAt = 470;
  const bookFadeDuration = 460;
  const coverOpensAt = 880;
  const coverOpenDuration = 720;
  const total = FIRST_MADI_PLACEMENT_MS;
  const at = (ms: number) => ms / total;
  const easing = "cubic-bezier(.42, 0, .24, 1)";
  const animations: Animation[] = [];
  const animate = (node: Element, frames: Keyframe[], timing: KeyframeAnimationOptions) => {
    const animation = node.animate(frames, { fill: "backwards", easing, ...timing });
    animations.push(animation);
    return animation;
  };

  if (guidance) animate(guidance, [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(8px)" }],
    { duration: 380, fill: "forwards" });
  animate(binding, [{ opacity: 0 }, { opacity: 1 }], { delay: bookAppearsAt, duration: bookFadeDuration });
  animate(cover, [{ transform: "rotateY(180deg)" }, { transform: "rotateY(0deg)" }],
    { delay: coverOpensAt, duration: coverOpenDuration });
  const placement = animate(page, [
    { transform: full, offset: 0, easing },
    { transform: besideBook, offset: at(900) },
    { transform: approaching, offset: at(insertionStartsAt), easing: "cubic-bezier(.36, .09, .28, 1)" },
    { transform: seated, offset: 1 },
  ], { duration: total, easing: "linear" });
  return { placement, cancel: () => animations.forEach(animation => animation.cancel()) };
}
