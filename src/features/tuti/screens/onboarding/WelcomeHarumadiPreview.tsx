"use client";

import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BackButton, BaseButton, Button, PrimaryButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { welcomeHarumadiNeighbor, welcomeHarumadiTurn, WELCOME_HARUMADI_LAST_PAGE, WELCOME_HARUMADI_PAGE_COUNT, type WelcomeHarumadiOrigin, type WelcomeHarumadiPage } from "@/shared/tuti/welcomeHarumadi";
import { WelcomeHarumadiSample } from "./WelcomeHarumadiSample";

export function WelcomeHarumadiPreview({ page, origin, onPageChange, onRecord, onClose }: {
  page: WelcomeHarumadiPage;
  origin: WelcomeHarumadiOrigin | null;
  onPageChange: (page: WelcomeHarumadiPage) => void;
  onRecord: () => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const retainedSheet = useRef<HTMLDivElement>(null);
  const [retainedPage, setRetainedPage] = useState<WelcomeHarumadiPage | null>(null);
  const turning = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const initialPage = useRef(page);
  const previousPage = useRef(page);
  const turned = useRef(false);
  const closing = useRef(false);
  const animation = useRef<Animation | null>(null);
  const previous = welcomeHarumadiNeighbor(page, -1);
  const next = welcomeHarumadiNeighbor(page, 1);
  const close = useCallback(() => {
    if (closing.current) return;
    const element = sheet.current;
    if (!element || !origin || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose(); return;
    }
    closing.current = true;
    animation.current?.cancel();
    element.style.transformOrigin = "left top";
    const target = element.getBoundingClientRect();
    const motion = element.animate([
      { transform: "none", opacity: 1 },
      { transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height}) rotateY(-12deg)`, opacity: 0 },
    ], { duration: 380, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
    animation.current = motion;
    void motion.finished.then(onClose).catch(() => {});
  }, [onClose, origin]);
  const turnTo = (next: WelcomeHarumadiPage | null) => {
    if (next === null || closing.current || turning.current || next === page) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animation.current?.cancel();
      turning.current = true;
      setRetainedPage(page);
    }
    onPageChange(next);
  };

  useLayoutEffect(() => {
    const element = sheet.current;
    if (!element) return;
    if (page !== initialPage.current) turned.current = true;
    const first = !turned.current;
    const turn = welcomeHarumadiTurn(previousPage.current, page);
    previousPage.current = page;
    element.style.transformOrigin = first ? "left top" : turn.transformOrigin;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Forward: old page exits above the new one. Backward: the previous page
    // enters above the retained current page, using the exact reversed motion.
    const retained = retainedSheet.current;
    if (!first && retained) {
      const moving = turn.phase === "exit" ? retained : element;
      moving.style.transformOrigin = turn.transformOrigin;
      const motion = moving.animate(turn.frames, {
        duration: turn.duration, easing: turn.easing, fill: "forwards",
      });
      animation.current = motion;
      const finish = () => { turning.current = false; setRetainedPage(null); };
      void motion.finished.then(finish).catch(finish);
      return () => motion.cancel();
    }
    const target = element.getBoundingClientRect();
    const frames = first && origin ? [
      { transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})`, opacity: 1 },
      { offset: 0.55, transform: "perspective(1200px) rotateY(-16deg) scale(0.96)", opacity: 1 },
      { transform: "perspective(1200px) rotateY(0deg) scale(1)", opacity: 1 },
    ] : [
      { transform: "perspective(1200px) rotateY(-32deg)", opacity: 0.3 },
      { transform: "perspective(1200px) rotateY(0deg)", opacity: 1 },
    ];
    const motion = element.animate(frames, {
      duration: first ? 760 : 520,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
    });
    animation.current = motion;
    return () => motion.cancel();
  }, [page, origin]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [page]);
  useEffect(() => () => animation.current?.cancel(), []);
  useEffect(() => {
    const back = (event: Event) => {
      // The purchase preparation dialog owns back/Escape while it is open.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault(); close();
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") back(event); };
    window.addEventListener(ANDROID_BACK_EVENT, back);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener(ANDROID_BACK_EVENT, back);
      window.removeEventListener("keydown", key);
    };
  }, [close]);

  return <Frame aria-labelledby="welcome-harumadi-title" data-harumadiPdf-screen>
    <Header>
      <BackButton aria-label="하루마디 예시에서 돌아가기" onClick={close} />
      <h1 id="welcome-harumadi-title" ref={heading} tabIndex={-1}>하루마디 예시</h1>
      <span aria-hidden="true" />
    </Header>
    <Stage>
      <Page ref={sheet} $ending={page === WELCOME_HARUMADI_LAST_PAGE} $front={retainedPage !== null && page < retainedPage} aria-label={`${page + 1} / ${WELCOME_HARUMADI_PAGE_COUNT}쪽`}>
        <HarumadiPageContent page={page} onRecord={onRecord} />
        <PageEdge type="button" data-harumadiPdf-edge="previous" aria-label="왼쪽 영역을 눌러 이전 쪽"
          disabled={previous === null || retainedPage !== null}
          onClick={() => turnTo(previous)} />
        <PageEdge type="button" data-harumadiPdf-edge="next" aria-label="오른쪽 영역을 눌러 다음 쪽"
          disabled={next === null || retainedPage !== null}
          onClick={() => turnTo(next)} />
      </Page>
      {retainedPage !== null && retainedPage !== page && <Page
        ref={retainedSheet} $ending={retainedPage === WELCOME_HARUMADI_LAST_PAGE} $front={retainedPage < page} $retained aria-hidden="true" inert
        data-harumadiPdf-retained data-harumadiPdf-outgoing={retainedPage < page ? "" : undefined}>
        <HarumadiPageContent page={retainedPage} onRecord={onRecord} />
      </Page>}
    </Stage>
    <Navigation aria-label="하루마디 예시 쪽 이동">
      <Button $size="compact" $tone="text" type="button" disabled={previous === null || retainedPage !== null} onClick={() => turnTo(previous)}>이전 쪽</Button>
      <span aria-live="polite">{page + 1} / {WELCOME_HARUMADI_PAGE_COUNT}</span>
      {next !== null ? <Button $size="compact" $tone="text" type="button" disabled={retainedPage !== null} onClick={() => turnTo(next)}>다음 쪽</Button>
        : <Button $size="compact" $tone="text" type="button" onClick={close}>덮기</Button>}
    </Navigation>
    <Source>예시 마디 · 사진은 AI로 만든 이미지예요</Source>
  </Frame>;
}

function HarumadiPageContent({ page, onRecord }: { page: WelcomeHarumadiPage; onRecord: () => void }) {
  if (page !== WELCOME_HARUMADI_LAST_PAGE) return <WelcomeHarumadiSample page={page === 0 ? "cover" : page === 1 ? "page" : "text"} priority />;
  return <Ending>
    <EndingCopy>
      <h2>이제 우리의<br />첫 마디를 남겨볼까요?</h2>
      <p>사진 한 장과 짧은 이야기로 시작해요.</p>
    </EndingCopy>
    <EndingActions>
      <RecordButton type="button" onClick={onRecord}>첫 마디 남기기</RecordButton>
    </EndingActions>
  </Ending>;
}

const reveal = keyframes`from { opacity: 0; } to { opacity: 1; }`;
const Frame = styled(ScreenFrame)`
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 16px; background: var(--color-surface); overflow: hidden;
  @container app-viewport (max-height: 500px) { gap: 10px; }
`;
const Header = styled.header`
  display: grid; grid-template-columns: 40px minmax(0, 1fr) 40px; align-items: center;
  h1 { font-size: var(--font-size-300); font-weight: 600; text-align: center; }
  h1:focus { outline: none; }
  animation: ${reveal} 400ms ease-out both;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const Stage = styled.div`
  min-height: 0; min-width: 0; container-type: size;
  display: grid; place-items: center; perspective: 1200px;
`;
const Page = styled.div<{ $ending: boolean; $front?: boolean; $retained?: boolean }>`
  position: relative;
  width: ${({ $ending }) => $ending ? "100%" : "min(100cqw, calc(100cqh * 148 / 210))"};
  height: ${({ $ending }) => $ending ? "100%" : "auto"};
  min-height: 0; transform-origin: left top; background: #fff;
  grid-area: 1 / 1;
  z-index: ${({ $front }) => $front ? 2 : 1};
  backface-visibility: hidden;
  ${({ $retained }) => $retained && "pointer-events: none;"}
  border: ${({ $ending }) => $ending ? "0" : "1px solid var(--color-border)"};
  /* Actual content actions stay above the transparent page-turn targets. */
  button:not([data-harumadiPdf-edge]), a { position: relative; z-index: 4; }
`;
const PageEdge = styled(BaseButton)`
  position: absolute; top: 0; bottom: 0; z-index: 3;
  width: 22%; min-width: 0; min-height: 44px; padding: 0;
  border: 0; border-radius: 0; background: transparent;
  &[data-harumadiPdf-edge="previous"] { left: 0; }
  &[data-harumadiPdf-edge="next"] { right: 0; }
  &:hover { background: transparent; }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
`;
const Ending = styled.div`
  width: 100%; height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) auto;
  align-items: center; padding: 24px 12px; gap: 24px;
  text-align: center; word-break: keep-all;
  @container app-viewport (max-height: 620px) { padding: 8px 0; gap: 12px; }
  @container app-viewport (max-height: 400px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: 1fr;
    gap: 16px; padding: 0;
  }
`;
const EndingCopy = styled.div`
  h2 { font-size: var(--font-size-600); font-weight: 700; line-height: 1.45; letter-spacing: var(--letter-spacing-heading); }
  p { margin-top: 16px; font-size: 14px; line-height: 1.8; color: var(--color-text-muted); }
  @container app-viewport (max-height: 620px) { h2 { font-size: 22px; } p { margin-top: 12px; font-size: 13px; } }
  @container app-viewport (max-height: 400px) { h2 { font-size: 18px; } p { font-size: 11px; margin-top: 8px; } }
`;
const EndingActions = styled.div`
  display: grid; gap: 12px; width: 100%;
  @container app-viewport (max-height: 620px) { gap: 8px; }
  @container app-viewport (max-height: 400px) {
    gap: 6px;
    button { min-height: 44px; padding: 6px 10px; font-size: 12px; }
  }
`;
const RecordButton = styled(PrimaryButton)`
  width: 100%; min-height: 52px; padding: 12px 16px;
  background: var(--color-brand-800); font-size: 14px; line-height: 1.5; white-space: normal;
  &:hover { background: var(--color-brand-900); }
`;
const Navigation = styled.nav`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  > span { font-size: 12px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
`;
const Source = styled.p`font-size: 10px; text-align: center; color: var(--color-text-muted);`;
