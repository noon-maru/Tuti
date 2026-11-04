"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { BaseButton } from "./buttons";
import { HarumadiPageSheet } from "./HarumadiSheet";
import { HarumadiByline } from "./HarumadiByline";
import { buildHarumadiReaderPages, harumadiPageAuthor, type HarumadiReaderPage } from "@/shared/harumadi/readerPages";
import { HARUMADI_READING_LAYOUT } from "@/shared/harumadi/readingTypography";
import { welcomeHarumadiTurn } from "@/shared/tuti/welcomeHarumadi";
import type { Harumadi } from "@/shared/api/harumadi";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { readerGroupGeometry, type ReaderTextMeasure } from "@/shared/harumadi/readerText";

export function HarumadiPageViewer({ book, entries, onClose, closing = false }: { book: Harumadi; entries: TutiJournalEntry[]; onClose: () => void; closing?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLDivElement>(null), navigation = useRef<HTMLElement>(null);
  const [measureText, setMeasureText] = useState<ReaderTextMeasure>();
  const captionSpace = book.shared ? HARUMADI_READING_LAYOUT.byline.gap + HARUMADI_READING_LAYOUT.byline.height : 0;
  const [geometry, setGeometry] = useState(() => readerGroupGeometry(320, 600, captionSpace));
  const { pageWidth, stageHeight } = geometry;
  useLayoutEffect(() => {
    const node = reader.current, controls = navigation.current;
    if (!node || !controls) return;
    const measure = () => {
      if (!node.clientWidth || !node.clientHeight) return;
      const gap = parseFloat(getComputedStyle(node).rowGap) || HARUMADI_READING_LAYOUT.viewer.gap;
      const next = readerGroupGeometry(node.clientWidth, node.clientHeight, captionSpace, controls.offsetHeight, gap);
      setGeometry(value => value.pageWidth === next.pageWidth && Math.abs(value.stageHeight - next.stageHeight) < .5 ? value : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure); observer.observe(node); observer.observe(controls);
    return () => observer.disconnect();
  }, [captionSpace]);
  useEffect(() => {
    const node = stage.current, context = document.createElement("canvas").getContext("2d");
    if (!node || !context) return;
    let active = true;
    const update = () => {
      if (!active) return;
      const style = getComputedStyle(node);
      const family = style.getPropertyValue("--font-pretendard").trim() || style.fontFamily;
      const cache = new Map<string, number>();
      setMeasureText(() => (text: string, size: number, weight = 400) => {
        const font = `${weight} ${size}px ${family}`, key = `${font}:${text}`;
        if (!cache.has(key)) { context.font = font; cache.set(key, context.measureText(text).width); }
        return cache.get(key)!;
      });
    };
    update();
    void document.fonts?.ready.then(update);
    return () => { active = false; };
  }, []);
  const pages = useMemo(() => buildHarumadiReaderPages(book, entries, pageWidth, measureText), [book, entries, pageWidth, measureText]);
  // 책장에서 표지를 이미 열었으므로 첫 지면부터 보여준다. 이전 쪽으로 표지를 볼 수 있다.
  const [index, setIndex] = useState(1);
  const current = Math.min(index, pages.length - 1);
  const lastPage = current === pages.length - 1;
  const [retained, setRetained] = useState<{ page: HarumadiReaderPage; index: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null), old = useRef<HTMLDivElement>(null);
  const locked = useRef(false), skipClick = useRef(false);
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null);
  const turn = (next: number) => {
    if (locked.current || closing || next < 0 || next === current) return;
    if (next >= pages.length) { onClose(); return; }
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof sheet.current?.animate === "function") {
      locked.current = true; setRetained({ page: pages[current], index: current });
    }
    setIndex(next);
  };
  useLayoutEffect(() => {
    if (!retained || !sheet.current || !old.current) return;
    const spec = welcomeHarumadiTurn(retained.index, current);
    const moving = spec.phase === "exit" ? old.current : sheet.current;
    moving.style.transformOrigin = spec.transformOrigin;
    const animation = moving.animate(spec.frames, { duration: spec.duration, easing: spec.easing, fill: "forwards" });
    let active = true;
    void animation.finished.then(() => { if (active) { locked.current = false; setRetained(null); } }).catch(() => {});
    return () => { active = false; animation.cancel(); };
  }, [current, retained]);
  const edge = (direction: number) => turn(current + direction);
  return <Reader ref={reader} data-harumadi-paged-reader data-current-page-kind={pages[current].kind} onKeyDown={event => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); turn(current + (event.key === "ArrowRight" ? 1 : -1)); }
  }}>
    <Stage ref={stage} style={{ height: stageHeight }} onClickCapture={event => { if (skipClick.current) { event.preventDefault(); event.stopPropagation(); skipClick.current = false; } }} onPointerDown={event => { if (event.isPrimary && event.button === 0) { skipClick.current = false; pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; } }}
      onPointerCancel={() => { pointer.current = null; }} onPointerUp={event => {
        const start = pointer.current; pointer.current = null;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { skipClick.current = true; turn(current + (dx < 0 ? 1 : -1)); }
      }}>
      <Page ref={sheet} $captionSpace={captionSpace} $front={Boolean(retained && current < retained.index)} aria-label={current === 0 ? "하루마디 표지" : `${current}쪽`}>
        <Paper>
        <HarumadiPageSheet page={pages[current]} coverStyle={book.coverStyle} number={current} />
        <Edge type="button" $side="left" aria-label="왼쪽 영역을 눌러 이전 쪽" disabled={closing || current === 0 || Boolean(retained)} onClick={() => edge(-1)} />
        <Edge type="button" $side="right" aria-label={lastPage ? "오른쪽 영역을 눌러 덮기" : "오른쪽 영역을 눌러 다음 쪽"} disabled={closing || Boolean(retained)} onClick={() => edge(1)} />
        </Paper>
        <HarumadiByline shared={book.shared} authorName={harumadiPageAuthor(book.shared, pages[current])} />
      </Page>
      {retained && <Page ref={old} $captionSpace={captionSpace} $front={retained.index < current} aria-hidden="true" inert data-retained-page>
        <Paper>
        <HarumadiPageSheet page={retained.page} coverStyle={book.coverStyle} number={retained.index} />
        </Paper>
        <HarumadiByline shared={book.shared} authorName={harumadiPageAuthor(book.shared, retained.page)} />
      </Page>}
    </Stage>
    <Navigation ref={navigation} aria-label="하루마디 쪽 이동">
      <Turn type="button" disabled={closing || current === 0 || Boolean(retained)} onClick={() => turn(current - 1)}>이전 쪽</Turn>
      <span role="status">{current + 1} / {pages.length}</span>
      <Turn type="button" disabled={closing || Boolean(retained)} onClick={() => turn(current + 1)}>{lastPage ? "덮기" : "다음 쪽"}</Turn>
    </Navigation>
  </Reader>;
}
const Reader = styled.div`display: flex; flex-direction: column; justify-content: flex-start; flex: 1; min-height: 0; gap: var(--reader-outside-inset, ${HARUMADI_READING_LAYOUT.viewer.gap}px);`;
const Stage = styled.div`display: grid; place-items: center; flex: none; min-height: 0; min-width: 0; container-type: size; perspective: 1200px; touch-action: pan-y; user-select: none;`;
const Page = styled.div<{ $front: boolean; $captionSpace: number }>`position: relative; grid-area: 1 / 1; width: min(100cqw, calc((100cqh - ${({ $captionSpace }) => $captionSpace}px) * 419.53 / 595.28)); z-index: ${({ $front }) => $front ? 2 : 1}; backface-visibility: hidden; &[data-retained-page] { pointer-events: none; }`;
const Paper = styled.div`position: relative; background: white; box-shadow: 0 7px 24px #1b222a10, -3px 0 0 #e8ede4; border: 1px solid #e4e9e0;`;
const Edge = styled(BaseButton)<{ $side: "left" | "right" }>`position: absolute; top: 0; bottom: 0; ${({ $side }) => $side}: 0; width: 22%; min-width: 0; border-radius: 0; padding: 0; background: transparent; &:hover { background: transparent; } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }`;
const Navigation = styled.nav`display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; > span { color: var(--color-text-muted); font-size: 13px; font-variant-numeric: tabular-nums; }`;
const Turn = styled(BaseButton)`min-height: 44px; padding: 8px; background: transparent; font-size: 14px; color: var(--color-text-muted); &:focus-visible { outline: 2px solid var(--color-brand-700); }`;
