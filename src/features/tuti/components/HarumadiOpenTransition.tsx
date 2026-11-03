"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import styled from "@emotion/styled";
import { HarumadiPageSheet } from "./HarumadiSheet";
import { buildHarumadiCoverPage } from "@/shared/harumadi/readerPages";
import { HARUMADI_PDF_LAYOUT } from "@/shared/harumadi/pdfLayout";
import { harumadiLocalRect, type HarumadiBookRect } from "@/shared/harumadi/transitionGeometry";
import { animateHarumadiOpen } from "@/lib/harumadiOpen";
import type { Harumadi } from "@/shared/api/harumadi";
import type { TutiJournalEntry } from "@/shared/api/journal";

/** Runs only after the reader's authorized content is available; no extra cover request. */
export function HarumadiOpenTransition({ book, entries, origin, containerRef, contentsRef, onComplete }: {
  book: Harumadi; entries: TutiJournalEntry[]; origin: HarumadiBookRect;
  containerRef: RefObject<HTMLElement | null>; contentsRef: RefObject<HTMLElement | null>; onComplete: () => void;
}) {
  const moving = useRef<HTMLDivElement>(null), cover = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = containerRef.current, node = moving.current, face = cover.current;
    if (!container || !node || !face) { onComplete(); return; }
    const bounds = container.getBoundingClientRect();
    const sheet = container.querySelector("[data-harumadi-paged-reader] [data-harumadi-page]");
    const ratio = HARUMADI_PDF_LAYOUT.page.width / HARUMADI_PDF_LAYOUT.page.height;
    const width = Math.max(1, Math.min(290, container.clientWidth - 48, (container.clientHeight - 100) * ratio));
    const target = sheet ? harumadiLocalRect(bounds, sheet.getBoundingClientRect(), container.offsetWidth, container.offsetHeight)
      : { x: (container.clientWidth - width) / 2, y: Math.max(0, (container.clientHeight - width / ratio) / 2), width, height: width / ratio };
    node.style.width = `${target.width}px`; node.style.left = `${target.x}px`; node.style.top = `${target.y}px`;
    return animateHarumadiOpen(node, face, contentsRef.current, origin, target, onComplete, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [origin, containerRef, contentsRef, onComplete]);
  return <Layer aria-hidden="true"><MovingBook ref={moving}><TurningCover ref={cover}>
    <HarumadiPageSheet page={buildHarumadiCoverPage(book, entries)} coverStyle={book.coverStyle} number={0} />
  </TurningCover></MovingBook></Layer>;
}
const Layer = styled.div`position: absolute; inset: 0; z-index: 10; pointer-events: none;`;
const MovingBook = styled.div`position: absolute; transform-origin: top left; width: 0; pointer-events: none;`;
const TurningCover = styled.div`transform-origin: left center; backface-visibility: hidden; will-change: transform, opacity; box-shadow: 0 8px 28px #1b222a18;`;
