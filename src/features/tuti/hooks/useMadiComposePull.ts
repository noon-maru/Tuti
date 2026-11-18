"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Harumadi } from "@/shared/api/harumadi";
import { madiComposePullOffset, settleMadiComposePull } from "@/lib/madiComposePull";

export type MadiComposePullPreview = { book: Harumadi; offset: number; settling: boolean };

export function useMadiComposePull({ containerRef, onCommit }: {
  containerRef: RefObject<HTMLElement | null>; onCommit: (bookId: string) => void;
}) {
  const [preview, setPreview] = useState<MadiComposePullPreview | null>(null);
  const current = useRef<MadiComposePullPreview | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true), frame = useRef<number | null>(null), stop = useRef<(() => void) | null>(null);
  const clearWork = useCallback(() => {
    if (frame.current !== null) { window.cancelAnimationFrame(frame.current); frame.current = null; }
    stop.current?.(); stop.current = null;
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearWork(); };
  }, [clearWork]);
  const settle = useCallback((book: Harumadi, opening: boolean) => {
    clearWork();
    const next = { book, offset: current.current?.offset ?? 0, settling: true };
    current.current = next; setPreview(next);
    // 첫 드래그 직후 놓거나 버튼으로 시작해도 미리보기 DOM이 연결된 다음에 마무리한다.
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      if (!alive.current) return;
      stop.current = settleMadiComposePull(layerRef.current, opening, () => {
        if (!alive.current) return;
        if (opening) onCommit(book.id);
        else { current.current = null; setPreview(null); }
      }, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    });
  }, [clearWork, onCommit]);
  const drag = useCallback((book: Harumadi, distance: number) => {
    if (current.current?.settling) return;
    const container = containerRef.current;
    if (!container) return;
    const next = { book, offset: madiComposePullOffset(distance, container.getBoundingClientRect().height, container.clientHeight), settling: false };
    current.current = next; setPreview(next);
  }, [containerRef]);
  const open = useCallback((book: Harumadi) => {
    if (!current.current?.settling) settle(book, true);
  }, [settle]);
  const cancel = useCallback(() => {
    if (current.current) settle(current.current.book, false);
  }, [settle]);
  return { preview, layerRef, drag, open, cancel };
}
