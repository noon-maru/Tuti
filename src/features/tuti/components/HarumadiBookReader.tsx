"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import styled from "@emotion/styled";
import { HarumadiFlow } from "@/features/tuti/flows/HarumadiFlow";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import type { Harumadi } from "@/shared/api/harumadi";
import type { HarumadiOpeningMode } from "../navigation/harumadiActions";
import type { HarumadiBookRect } from "@/shared/harumadi/transitionGeometry";

export type BookOpening = { book: Harumadi; mode: HarumadiOpeningMode; origin: HarumadiBookRect };

/** 책장을 교체하지 않고 같은 앱 영역 안에서 표지 뒤의 지면을 연다. */
export function HarumadiBookReader({ opening, onClose, registerCloseGuard }: { opening: BookOpening; onClose: () => void; registerCloseGuard?: (guard: (() => Promise<boolean>) | null) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useLayoutEffect(() => {
    const previous = returnFocus.current;
    root.current?.focus();
    const animations: Animation[] = [];
    if (opening.mode !== "pages" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof paper.current?.animate === "function") {
      animations.push(paper.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: "backwards" }));
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
  return <Reader ref={root} $spread={opening.mode === "pages" && opening.origin.appearance === "spread"} role="dialog" aria-modal="true" aria-label={`${opening.book.title} ${opening.mode === "settings" ? "설정" : opening.mode === "together" ? "함께 채우기" : "펼쳐보기"}`} tabIndex={-1} onKeyDown={keyDown}>
    <Paper ref={paper}><HarumadiFlow bookId={opening.book.id} initialMode={opening.mode} openingOrigin={opening.mode === "pages" ? opening.origin : undefined} onClose={onClose} registerCloseGuard={registerCloseGuard} /></Paper>
  </Reader>;
}

const Reader = styled.div<{ $spread: boolean }>`position: absolute; inset: 0; z-index: 30; overflow: hidden; outline: none; background: ${({ $spread }) => $spread ? "transparent" : "#f8fafc"};`;
const Paper = styled.div`height: 100%; min-height: 0;`;
