/** 펼침 중이어도 현재 보이는 각도에서 접고, 끝날 때까지 기존 지면 DOM을 유지한다. */
export function foldCarouselBook(spread: HTMLElement | null, signal: AbortSignal, reducedMotion = false): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (!spread || reducedMotion || spread.dataset.spreadReady !== "true" || typeof spread.animate !== "function") return Promise.resolve(true);
  const leaf = spread.querySelector<HTMLElement>('[data-spread-leaf="left"]');
  const cover = spread.querySelector<HTMLElement>("[data-spread-turning-cover]");
  if (!leaf || !cover) return Promise.resolve(true);
  return new Promise(resolve => {
    const animations: Animation[] = [];
    let completed = false;
    const finish = (applied: boolean) => {
      if (completed) return;
      completed = true;
      signal.removeEventListener("abort", abort);
      if (!applied) animations.forEach(animation => animation.cancel());
      resolve(applied);
    };
    const abort = () => finish(false);
    signal.addEventListener("abort", abort, { once: true });
    try {
      const options: KeyframeAnimationOptions = { duration: 420, easing: "cubic-bezier(.33,0,.2,1)", fill: "forwards" };
      // computed transform을 시작점으로 삼아 아직 펼쳐지는 중인 책도 뛰지 않게 한다.
      animations.push(spread.animate([{ transform: getComputedStyle(spread).transform }, { transform: "translateX(-25%)" }], options));
      animations.push(leaf.animate([{ transform: getComputedStyle(leaf).transform }, { transform: "rotateY(173deg)" }], options));
      animations.push(cover.animate([
        { transform: getComputedStyle(cover).transform, opacity: getComputedStyle(cover).opacity },
        { opacity: 1, offset: .2 },
        { transform: "rotateY(0deg)", opacity: 1 },
      ], options));
      void Promise.all(animations.map(animation => animation.finished)).then(() => finish(true), () => finish(false));
    } catch {
      animations.forEach(animation => { void animation.finished.catch(() => {}); animation.cancel(); });
      finish(true); // 미지원 WebView에서는 이동 자체를 막지 않는다.
    }
  });
}
