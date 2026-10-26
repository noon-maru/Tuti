type RequiredConsentAnimation = {
  ageConfirmed: boolean;
  termsConfirmed: boolean;
  confirmAge: () => void;
  confirmTerms: () => void;
  reducedMotion: boolean;
  signal: AbortSignal;
};

function waitForStep(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// 명시적인 시작 버튼 클릭 뒤에만 실행한다. 선택 위치 동의는 이 순서에 포함하지 않는다.
export async function animateRequiredConsents(
  options: RequiredConsentAnimation,
  wait = waitForStep,
) {
  const steps = [
    { confirmed: options.ageConfirmed, confirm: options.confirmAge },
    { confirmed: options.termsConfirmed, confirm: options.confirmTerms },
  ].filter(step => !step.confirmed);
  for (const [index, step] of steps.entries()) {
    if (!options.reducedMotion) await wait(index === 0 ? 80 : 140, options.signal);
    options.signal.throwIfAborted();
    step.confirm();
  }
  if (steps.length && !options.reducedMotion) await wait(180, options.signal);
  options.signal.throwIfAborted();
}
