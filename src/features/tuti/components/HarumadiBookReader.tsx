"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import styled from "@emotion/styled";
import { HarumadiFlow } from "@/features/tuti/flows/HarumadiFlow";
import { HarumadiCover } from "./HarumadiCover";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import type { Harumadi } from "@/shared/api/harumadi";

export type BookOpening = { book: Harumadi; settings: boolean; origin: { x: number; y: number; width: number; height: number } };

/** 책장을 교체하지 않고 같은 앱 영역 안에서 표지 뒤의 지면을 연다. */
export function HarumadiBookReader({ opening, ownerId, onClose }: { opening: BookOpening; ownerId: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useLayoutEffect(() => {
    const previous = returnFocus.current;
    root.current?.focus();
    const animations: Animation[] = [];
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof paper.current?.animate === "function") {
      animations.push(paper.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: opening.settings ? 180 : 360, delay: opening.settings ? 0 : 340, fill: "backwards" }));
      if (!opening.settings && root.current && book.current && cover.current) {
        const bounds = root.current.getBoundingClientRect();
        const target = root.current.querySelector("[data-harumadi-page]")?.getBoundingClientRect();
        const width = target?.width ?? Math.min(bounds.width - 64, 290), height = width * 210 / 148;
        const x = target ? target.left - bounds.left : (bounds.width - width) / 2, y = target ? target.top - bounds.top : Math.max(60, (bounds.height - height) / 2);
        book.current.style.width = `${width}px`;
        book.current.style.opacity = "1";
        book.current.style.left = `${x}px`; book.current.style.top = `${y}px`;
        animations.push(book.current.animate([
          { transform: `translate(${opening.origin.x - x}px, ${opening.origin.y - y}px) scale(${opening.origin.width / width}, ${opening.origin.height / height})` },
          { transform: "translate(0, 0) scale(1)" },
        ], { duration: 520, easing: "cubic-bezier(.22,.68,.2,1)", fill: "backwards" }));
        animations.push(cover.current.animate([
          { transform: "perspective(1100px) rotateY(0deg)", opacity: 1, offset: 0 },
          { transform: "perspective(1100px) rotateY(-82deg)", opacity: 1, offset: .78 },
          { transform: "perspective(1100px) rotateY(-105deg)", opacity: 0, offset: 1 },
        ], { duration: 680, delay: 160, easing: "cubic-bezier(.3,0,.2,1)", fill: "both" }));
      }
    }
    // Android 뒤로가기: 편집 화면은 자체 핸들러를 사용하고, 로딩/오류 상태도 닫을 수 있다.
    const back = (event: Event) => {
      // 편집기가 있으면 그 화면의 저장 중 보호·단계별 뒤로가기를 우선한다.
      if (root.current?.querySelector("[data-harumadi-editor]")) return;
      if (!event.defaultPrevented) { event.preventDefault(); onClose(); }
    };
    window.addEventListener(ANDROID_BACK_EVENT, back);
    return () => {
      animations.forEach(animation => animation.cancel());
      window.removeEventListener(ANDROID_BACK_EVENT, back);
      previous?.focus();
    };
  }, [opening, onClose]);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); window.dispatchEvent(new Event(ANDROID_BACK_EVENT, { cancelable: true })); }
    if (event.key !== "Tab" || !root.current) return;
    const controls = Array.from(root.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
  };
  return <Reader ref={root} role="dialog" aria-modal="true" aria-label={`${opening.book.title} ${opening.settings ? "설정" : "펼쳐보기"}`} tabIndex={-1} onKeyDown={keyDown}>
    <Paper ref={paper}><HarumadiFlow bookId={opening.book.id} initialMode={opening.settings ? "settings" : "pages"} onClose={onClose} /></Paper>
    {!opening.settings && <MovingBook ref={book} aria-hidden="true"><TurningCover ref={cover}>
      <HarumadiCover ownerId={ownerId} kind="harumadi" harumadiPdf={{ ...opening.book, entryCount: opening.book.entryIds.length, pageCount: 0, hasCover: opening.book.coverStyle.endsWith("-image") && opening.book.entryIds.length > 0 }} />
    </TurningCover></MovingBook>}
  </Reader>;
}

const Reader = styled.div`position: absolute; inset: 0; z-index: 30; overflow: hidden; outline: none; background: #f8fafc;`;
const Paper = styled.div`height: 100%; min-height: 0;`;
const MovingBook = styled.div`position: absolute; pointer-events: none; transform-origin: top left; width: 0; opacity: 0; @media (prefers-reduced-motion: reduce) { display: none; }`;
const TurningCover = styled.div`transform-origin: left center; backface-visibility: hidden; will-change: transform, opacity;`;
