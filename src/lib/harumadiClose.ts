/** 표지 닫기 → 닫힌 책 정리 순서. transform/opacity만 움직인다. */
export function animateHarumadiClose(cover: HTMLElement, contents: HTMLElement | null, onComplete: () => void, reducedMotion = false) {
  let active = true, completed = false;
  const animations: Animation[] = [];
  const finish = () => { if (active && !completed) { completed = true; onComplete(); } };
  const cancel = () => { active = false; animations.forEach(animation => animation.cancel()); };
  if (reducedMotion || typeof cover.animate !== "function") { finish(); return cancel; }
  try {
    const closing = cover.animate([
      { transform: "perspective(1100px) rotateY(-100deg)", opacity: 0, offset: 0 },
      { transform: "perspective(1100px) rotateY(-72deg)", opacity: 1, offset: .2 },
      { transform: "perspective(1100px) rotateY(0deg)", opacity: 1, offset: 1 },
    ], { duration: 560, easing: "cubic-bezier(.22,.68,.2,1)", fill: "both" });
    animations.push(closing);
    if (typeof contents?.animate === "function") animations.push(contents.animate([
      { opacity: 1 }, { opacity: 0 },
    ], { duration: 240, delay: 120, fill: "forwards" }));
    void closing.finished.then(async () => {
      if (!active) return;
      const leaving = cover.animate([
        { transform: "scale(1)", opacity: 1 },
        { transform: "translateY(12px) scale(.94)", opacity: 0 },
      ], { duration: 180, easing: "ease-in", fill: "forwards" });
      animations.push(leaving);
      await leaving.finished;
      finish();
    }).catch(finish);
  } catch { finish(); }
  return cancel;
}
