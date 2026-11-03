"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import styled from "@emotion/styled";
import { HarumadiPageSheet } from "./HarumadiSheet";
import { buildHarumadiCoverPage } from "@/shared/harumadi/readerPages";
import { HARUMADI_PDF_LAYOUT } from "@/shared/harumadi/pdfLayout";
import { animateHarumadiClose, animateHarumadiFade } from "@/lib/harumadiClose";
import { harumadiLocalRect } from "@/shared/harumadi/transitionGeometry";
import type { Harumadi } from "@/shared/api/harumadi";
import type { TutiJournalEntry } from "@/shared/api/journal";

export function HarumadiCloseTransition({ book, entries, containerRef, contentsRef, fadeOnly = false, onComplete }: {
  book: Harumadi; entries: TutiJournalEntry[]; containerRef: RefObject<HTMLElement | null>; contentsRef: RefObject<HTMLElement | null>; fadeOnly?: boolean; onComplete: () => void;
}) {
  const cover = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fadeOnly) return animateHarumadiFade(contentsRef.current, onComplete, reduced);
    const node = cover.current;
    const container = containerRef.current;
    if (!container || !node) { onComplete(); return; }
    const bounds = container.getBoundingClientRect();
    const targetBounds = container.querySelector("[data-harumadi-paged-reader] [data-harumadi-page]")?.getBoundingClientRect();
    const target = targetBounds ? harumadiLocalRect(bounds, targetBounds, container.offsetWidth, container.offsetHeight) : null;
    const ratio = HARUMADI_PDF_LAYOUT.page.width / HARUMADI_PDF_LAYOUT.page.height;
    const width = target?.width ?? Math.max(1, Math.min(290, container.clientWidth - 48, (container.clientHeight - 100) * ratio));
    const height = width / ratio;
    node.style.width = `${width}px`;
    node.style.left = `${target?.x ?? (container.clientWidth - width) / 2}px`;
    node.style.top = `${target?.y ?? Math.max(0, (container.clientHeight - height) / 2)}px`;
    return animateHarumadiClose(node, contentsRef.current, onComplete, reduced);
  }, [containerRef, contentsRef, fadeOnly, onComplete]);
  return fadeOnly ? null : <Layer aria-hidden="true"><Cover ref={cover}>
    <HarumadiPageSheet page={buildHarumadiCoverPage(book, entries)} coverStyle={book.coverStyle} number={0} />
  </Cover></Layer>;
}

const Layer = styled.div`position: absolute; inset: 0; z-index: 10; pointer-events: none; perspective: 1100px;`;
const Cover = styled.div`position: absolute; transform-origin: left center; backface-visibility: hidden; will-change: transform, opacity; box-shadow: 0 8px 28px #1b222a18;`;
