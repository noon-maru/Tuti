/** A temporary four-strip surface: no duplicate React mounts or content requests. */
const running = new WeakMap<HTMLElement, () => void>();

export function paperFlexFrames(direction: "open" | "close", index: number, hinge: "left" | "right" = "left"): Keyframe[] {
  const curl = Math.max(0, Math.min(3, index)) * (direction === "open" ? 3.5 : -3.5) * (hinge === "right" ? -1 : 1);
  return [
    { transform: "rotateY(0deg)", offset: 0 },
    { transform: `rotateY(${curl * .65}deg)`, offset: .28 },
    { transform: `rotateY(${curl}deg)`, offset: .56 },
    { transform: "rotateY(0deg)", offset: 1 },
  ];
}

/** Keep the spine fixed; let the outer edge trail, then restore the original DOM. */
export function animateHarumadiPaperFlex(target: HTMLElement, direction: "open" | "close", duration: number, delay = 0) {
  const surface = target.matches?.("[data-paper-surface]") ? target : target.querySelector?.<HTMLElement>("[data-paper-surface]");
  const source = surface?.querySelector<HTMLElement>("[data-paper-source]");
  if (!surface || !source || !source.ownerDocument?.createElement) return () => {};
  running.get(surface)?.();
  const visibility = source.style.visibility;
  const hinge = surface.dataset.paperHinge === "right" ? "right" : "left";
  const layer = source.ownerDocument.createElement("span");
  layer.dataset.paperFlexLayer = "true";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none", transformStyle: "preserve-3d" });
  const animations: Animation[] = [];
  let cleaned = false;
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    animations.forEach(animation => animation.cancel());
    layer.remove();
    source.style.visibility = visibility;
    if (running.get(surface) === clean) running.delete(surface);
  };
  running.set(surface, clean);
  try {
    let parent = layer;
    for (let index = 0; index < 4; index++) {
      const joint = source.ownerDocument.createElement("span");
      Object.assign(joint.style, { position: "absolute", top: "0", [hinge]: index ? "100%" : "0", width: index ? "100%" : "25%", height: "100%", transformOrigin: `${hinge} center`, transformStyle: "preserve-3d" });
      const clip = source.ownerDocument.createElement("span");
      Object.assign(clip.style, { position: "absolute", inset: "0", overflow: "hidden", backfaceVisibility: "hidden" });
      const copy = source.cloneNode(true) as HTMLElement;
      Object.assign(copy.style, { position: "absolute", top: "0", [hinge]: `${-100 * index}%`, width: "400%", height: "100%", visibility: "visible" });
      copy.removeAttribute("data-paper-source");
      clip.append(copy);
      joint.append(clip);
      parent.append(joint);
      parent = joint;
      if (!index) continue;
      const options: KeyframeAnimationOptions = { duration: Math.max(1, duration - index * 16), delay: delay + index * 16, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" };
      const bend = joint.animate(paperFlexFrames(direction, index, hinge), options);
      animations.push(bend);
      void bend.finished.catch(() => {});
      const shade = source.ownerDocument.createElement("span");
      Object.assign(shade.style, { position: "absolute", inset: "0", background: "linear-gradient(90deg, #1b222a, transparent)", opacity: "0", pointerEvents: "none" });
      clip.append(shade);
      const light = shade.animate([{ opacity: 0 }, { opacity: .035 + index * .012, offset: .5 }, { opacity: 0 }], options);
      animations.push(light);
      void light.finished.catch(() => {});
    }
    surface.append(layer);
    source.style.visibility = "hidden";
    void Promise.all(animations.map(animation => animation.finished)).then(clean, clean);
  } catch { clean(); } // Geometry is optional: a WebView failure must not block navigation.
  return clean;
}
