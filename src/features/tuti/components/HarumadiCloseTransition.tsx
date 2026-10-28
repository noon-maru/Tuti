"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import styled from "@emotion/styled";
import { HarumadiPageSheet } from "./HarumadiSheet";
import { buildHarumadiCoverPage } from "@/shared/harumadi/readerPages";
import { HARUMADI_PDF_LAYOUT } from "@/shared/harumadi/pdfLayout";
import { animateHarumadiClose } from "@/lib/harumadiClose";
import type { Harumadi } from "@/shared/api/harumadi";
import type { TutiJournalEntry } from "@/shared/api/journal";

export function HarumadiCloseTransition({ book, entries, containerRef, contentsRef, onComplete }: {
  book: Harumadi; entries: TutiJournalEntry[]; containerRef: RefObject<HTMLElement | null>; contentsRef: RefObject<HTMLElement | null>; onComplete: () => void;
}) {
  const cover = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = cover.current;
    const container = containerRef.current;
    if (!container || !node) { onComplete(); return; }
    const bounds = container.getBoundingClientRect();
    const target = container.querySelector("[data-harumadi-paged-reader] [data-harumadi-page]")?.getBoundingClientRect();
    const ratio = HARUMADI_PDF_LAYOUT.page.width / HARUMADI_PDF_LAYOUT.page.height;
    const width = target?.width ?? Math.max(1, Math.min(290, bounds.width - 48, (bounds.height - 100) * ratio));
    const height = width / ratio;
    node.style.width = `${width}px`;
    node.style.left = `${target ? target.left - bounds.left : (bounds.width - width) / 2}px`;
    node.style.top = `${target ? target.top - bounds.top : Math.max(0, (bounds.height - height) / 2)}px`;
    return animateHarumadiClose(node, contentsRef.current, onComplete, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [containerRef, contentsRef, onComplete]);
  return <Layer aria-hidden="true"><Cover ref={cover}>
    <HarumadiPageSheet page={buildHarumadiCoverPage(book, entries)} coverStyle={book.coverStyle} number={0} />
  </Cover></Layer>;
}

const Layer = styled.div`position: absolute; inset: 0; z-index: 10; pointer-events: none; perspective: 1100px;`;
const Cover = styled.div`position: absolute; transform-origin: left center; backface-visibility: hidden; will-change: transform, opacity; box-shadow: 0 8px 28px #1b222a18;`;
