/** Keep the outgoing spread mounted for the existing CSS slide/fade, without folding it. */
export function waitForCarouselSlide(signal: AbortSignal, reducedMotion = false): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (reducedMotion) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = (applied: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(applied);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), 560);
    signal.addEventListener("abort", abort, { once: true });
  });
}
