"use client";

import styled from "@emotion/styled";
import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, MoreVertical } from "lucide-react";
import type { Harumadi } from "@/shared/api/harumadi";
import { carouselDragProgress, carouselGestureAxis, carouselIndex, carouselPose, carouselShouldWrite, carouselStageHeight, carouselSwipeDirection, carouselTapDirection, carouselWriteProgress } from "@/shared/harumadi/libraryCarousel";
import { harumadiActions, type HarumadiOpeningMode } from "../navigation/harumadiActions";
import { HarumadiCover } from "./HarumadiCover";
import { HarumadiSpreadPreview } from "./HarumadiSpreadPreview";
import { ContextMenu } from "./ContextMenu";
import { BaseButton } from "./buttons";
import { HarumadiTitleHint } from "./HarumadiTitleHint";
import { harumadiAccessibleTitle } from "@/shared/harumadi/titleHints";
import { foldCarouselBook } from "@/lib/carouselBookFold";

type Gesture = { id: number; x: number; y: number; dx: number; startedAt: number; width: number; dragging: boolean; bookId: string; axis?: "horizontal" | "up" };
export function HarumadiCarousel({ books, ownerId, onOpen, onCreateMadi, hasNextPage = false, loading = false, onLoadMore }: {
  books: Harumadi[]; ownerId: string;
  onOpen: (book: Harumadi, control: HTMLElement, mode?: HarumadiOpeningMode) => void;
  onCreateMadi?: (bookId: string) => void;
  hasNextPage?: boolean; loading?: boolean; onLoadMore?: () => Promise<string | null>;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null), details = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null), blockedClickUntil = useRef(0), requesting = useRef(false);
  const [selection, setSelection] = useState(() => ({ id: books[0]?.id ?? null, index: 0 }));
  const [size, setSize] = useState({ width: 320, height: 300 }), [drag, setDrag] = useState(0), [dragging, setDragging] = useState(false), [pending, setPending] = useState(false);
  const [writeProgress, setWriteProgress] = useState(0);
  const [folding, setFolding] = useState(false);
  const turning = useRef<AbortController | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => { controller.abort(); turning.current?.abort(); };
  }, [ownerId]);
  const { width, height } = size;
  const spreadWidth = Math.min(width * .88, height * 1.25, 440);
  const bookHeight = spreadWidth / 2 * 595.28 / 419.53;
  const index = carouselIndex(books.map(book => book.id), selection), active = books[index];
  useEffect(() => {
    const node = stage.current, carousel = root.current, description = details.current, parent = carousel?.parentElement;
    if (!node || !carousel || !description || !parent) return;
    const measure = () => {
      if (!node.clientWidth || !parent.clientHeight) return;
      const style = getComputedStyle(parent);
      const siblings = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child !== carousel);
      const reserved = siblings.reduce((sum, child) => {
        const css = getComputedStyle(child);
        return sum + child.offsetHeight + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0);
      }, 0);
      const available = parent.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - reserved - (parseFloat(style.rowGap) || 0) * siblings.length;
      const next = { width: node.clientWidth, height: carouselStageHeight(node.clientWidth, available, description.offsetHeight) };
      setSize(previous => previous.width === next.width && Math.abs(previous.height - next.height) < 1 ? previous : next);
    }; measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure);
    for (const target of [parent, carousel, description, ...Array.from(parent.children)]) observer.observe(target);
    return () => observer.disconnect();
  }, [active?.id, hasNextPage]);
  useEffect(() => {
    const cancel = () => {
      const current = gesture.current; gesture.current = null;
      setDrag(0); setDragging(false); setWriteProgress(0);
      const node = stage.current;
      if (current && node?.hasPointerCapture(current.id)) node.releasePointerCapture(current.id);
    };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  const transitionTo = async (next: { id: string; index: number }) => {
    if (turning.current || lifetime.current?.signal.aborted || next.id === active?.id) return;
    const controller = new AbortController();
    turning.current = controller;
    setFolding(true);
    try {
      const spread = stage.current?.querySelector<HTMLElement>('[data-carousel-active="true"] [data-harumadi-spread-preview]') ?? null;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      if (await foldCarouselBook(spread, controller.signal, reduced) && !controller.signal.aborted) setSelection(next);
    } finally {
      if (turning.current === controller) turning.current = null;
      if (!lifetime.current?.signal.aborted) setFolding(false);
    }
  };
  const choose = (next: number) => {
    if (requesting.current || turning.current || loading) return;
    const book = books[next]; if (book) void transitionTo({ id: book.id, index: next });
  };
  const move = async (direction: -1 | 1) => {
    if (requesting.current || turning.current || loading) return;
    if (books[index + direction]) { choose(index + direction); return; }
    if (direction !== 1 || !hasNextPage || !onLoadMore || loading) return;
    requesting.current = true; setPending(true);
    const currentLifetime = lifetime.current;
    try {
      const id = await onLoadMore(); if (id && !currentLifetime?.signal.aborted) await transitionTo({ id, index: index + 1 });
    } catch { /* 공통 책장 오류·재시도 안내는 부모가 표시한다. */ }
    finally { requesting.current = false; if (!currentLifetime?.signal.aborted) setPending(false); }
  };
  const openSelected = (mode?: HarumadiOpeningMode) => {
    if (turning.current || requesting.current || loading) return;
    const button = stage.current?.querySelector<HTMLElement>('[data-carousel-active="true"] [data-book-cover]');
    if (active && button) onOpen(active, button, mode);
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!active || gesture.current || turning.current || !event.isPrimary || event.button !== 0 || pending || loading) return;
    blockedClickUntil.current = 0;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, startedAt: event.timeStamp, width: event.currentTarget.getBoundingClientRect().width, dragging: false, bookId: active.id };
  };
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current; if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (!current.dragging) {
      const axis = carouselGestureAxis(dx, dy, Boolean(onCreateMadi));
      if (axis === "scroll") { gesture.current = null; blockedClickUntil.current = event.timeStamp + 300; return; }
      if (!axis) return;
      current.axis = axis;
      current.dragging = true; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
    }
    current.dx = dx;
    if (current.axis === "up") setWriteProgress(carouselWriteProgress(dy, current.width));
    else setDrag(carouselDragProgress(dx, current.width, index, books.length));
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current; if (!current || current.id !== event.pointerId) return;
    gesture.current = null; setDrag(0); setDragging(false); setWriteProgress(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current.dragging) return;
    blockedClickUntil.current = event.timeStamp + 300;
    if (cancelled || pending || loading || active?.id !== current.bookId) return;
    if (current.axis === "up") {
      if (carouselShouldWrite(event.clientY - current.y, current.width, event.timeStamp - current.startedAt)) onCreateMadi?.(current.bookId);
      return;
    }
    const direction = carouselSwipeDirection(event.clientX - current.x, current.width, event.timeStamp - current.startedAt);
    if (direction) void move(direction);
  };
  if (!active) return null;
  const busy = pending || loading || folding;
  return <Carousel ref={root} data-library-view="carousel">
    <Stage ref={stage} role="region" aria-roledescription="캐러셀" aria-label="하루마디 한 권씩 보기" tabIndex={0} data-swipe-back-ignore="true"
      style={{ height, "--carousel-book-half-height": `${bookHeight / 2}px` } as CSSProperties} $dragging={dragging} $canWrite={Boolean(onCreateMadi)} onPointerDown={begin} onPointerMove={follow} onPointerUp={event => finish(event)}
      onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => { if (event.target === event.currentTarget) finish(event, true); }}
      onDragStart={event => event.preventDefault()} onClickCapture={event => { if (event.timeStamp < blockedClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); void move(event.key === "ArrowLeft" ? -1 : 1); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); choose(event.key === "Home" ? 0 : books.length - 1); }
        else if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); openSelected(); }
      }}>
      {books.slice(Math.max(0, index - 3), index + 4).map(book => {
        const bookIndex = books.indexOf(book), selected = book.id === active.id;
        const pose = carouselPose(bookIndex - index - drag);
        return <Slide key={book.id} data-harumadi-card data-carousel-active={selected} aria-hidden={!selected} $dragging={dragging}
          style={{ width: spreadWidth, zIndex: pose.zIndex, opacity: pose.opacity, pointerEvents: pose.opacity > .1 ? "auto" : "none", transform: `translate(-50%, -50%) translateX(${pose.x * width}px) translateY(${-writeProgress * 48 * (selected ? 1 : .2)}px) scale(${pose.scale}) rotateY(${pose.rotation}deg)` }}>
          <CoverButton $spread={selected} style={{ "--spread-page-scale": (spreadWidth / 2 - 2) / 320 } as CSSProperties} data-book-cover type="button" disabled={busy} tabIndex={selected ? 0 : -1} aria-label={`${harumadiAccessibleTitle(book)}, 마디 ${book.entryIds.length}개 ${selected ? "미리보기 열기" : "선택"}`}
            onClick={event => {
              if (turning.current || requesting.current || loading) return;
              if (!selected) { choose(bookIndex); return; }
              const direction = carouselTapDirection(event.clientX, event.currentTarget.getBoundingClientRect(), event.detail === 0);
              if (direction) void move(direction); else onOpen(book, event.currentTarget);
            }}>
            {selected ? <HarumadiSpreadPreview book={book} ownerId={ownerId} /> : <CarouselCover book={book} ownerId={ownerId} />}
          </CoverButton>
        </Slide>;
      })}
    </Stage>
    <Details ref={details}>
    {onCreateMadi && <WriteHint type="button" disabled={busy} aria-label={`${active.title}, 이 하루마디에 마디 남기기`} $active={writeProgress > 0} onClick={() => onCreateMadi(active.id)}><ChevronUp size={16} aria-hidden="true" />위로 쓸어 마디 남기기</WriteHint>}
    <Caption><div aria-live="polite" aria-atomic="true"><strong>{active.title}</strong><p>{active.entryIds.length ? `마디 ${active.entryIds.length}개` : "첫 마디를 기다려요"}{active.shared ? " · 함께 채우는 중" : ""}</p>
      <HarumadiTitleHint book={active} />{active.role === "contributor" && <small>{active.ownerName}님의 하루마디</small>}</div>
      <BookMenu label={`${harumadiAccessibleTitle(active)} 메뉴`} triggerContent={<MoreVertical size={22} />} items={harumadiActions(active).map(action => ({ label: action.label, singleLine: true, onSelect: () => openSelected(action.mode) }))} />
    </Caption>
    <Controls aria-label="하루마디 넘기기">
      <Arrow type="button" aria-label="이전 하루마디" disabled={index === 0 || busy} onClick={() => void move(-1)}><ChevronLeft size={20} /></Arrow>
      <span aria-live="polite" aria-atomic="true" aria-busy={busy}>{pending || loading ? "불러오는 중" : `${index + 1} / ${books.length}${hasNextPage ? "+" : ""}`}</span>
      <Arrow type="button" aria-label="다음 하루마디" disabled={busy || (index === books.length - 1 && !hasNextPage)} onClick={() => void move(1)}><ChevronRight size={20} /></Arrow>
    </Controls>
    </Details>
  </Carousel>;
}

// 드래그 프레임에서는 위치만 바꾸고 이미지 조회·표지 구성은 다시 렌더하지 않는다.
const CarouselCover = memo(function CarouselCover({ book, ownerId }: { book: Harumadi; ownerId: string }) {
  return <HarumadiCover ownerId={ownerId} kind="harumadi" harumadiPdf={{ ...book, entryCount: book.entryIds.length, pageCount: 0, hasCover: book.coverStyle.endsWith("-image") && book.entryIds.length > 0 }} />;
});

const Carousel = styled.div`display: flex; flex-direction: column; flex: 1 0 auto; width: 100%; min-width: 0; padding: 16px 0;`;
const Details = styled.div`display: flow-root; flex: none;`;
// 책 영역만 단일 터치를 예약하고 핀치 확대와 바깥 영역의 세로 스크롤은 보존한다.
const Stage = styled.div<{ $dragging: boolean; $canWrite: boolean }>`position: relative; flex: none; overflow: hidden; perspective: 850px; touch-action: ${({ $canWrite }) => $canWrite ? "pinch-zoom" : "pan-y"}; user-select: none; cursor: ${({ $dragging }) => $dragging ? "grabbing" : "grab"}; isolation: isolate;
  &::after { content: ""; position: absolute; width: 60%; height: 12px; border-radius: 50%; background: #1b222a0a; filter: blur(10px); top: calc(50% + var(--carousel-book-half-height) - 6px); left: 20%; z-index: -1; }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -3px; border-radius: 12px; }
`;
const Slide = styled.div<{ $dragging: boolean }>`position: absolute; top: 50%; left: 50%; will-change: transform; backface-visibility: hidden;
  transition: ${({ $dragging }) => $dragging ? "none" : "transform 560ms cubic-bezier(.22,.75,.22,1), opacity 440ms ease"};
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
const CoverButton = styled(BaseButton)<{ $spread: boolean }>`display: block; padding: 0; width: ${({ $spread }) => $spread ? "100%" : "50%"}; margin: 0 auto; background: transparent; color: inherit; cursor: inherit; -webkit-user-drag: none;
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 5px; border-radius: 4px; }
`;
const WriteHint = styled(BaseButton)<{ $active: boolean }>`display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; margin: 0 auto; padding: 6px 14px; color: ${({ $active }) => $active ? "var(--color-brand-1000)" : "var(--color-text-muted)"}; background: transparent; font-size: var(--ui-caption-size); border-radius: 12px;
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 2px; }
  &:disabled { opacity: .4; }
`;
const Caption = styled.div`display: grid; grid-template-columns: minmax(0, 1fr) 44px; align-items: start; gap: 8px; margin: 8px 12px 0; text-align: left; > div { min-width: 0; } strong { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size: var(--font-size-400); font-weight: var(--ui-title-weight); line-height: 1.5; letter-spacing: var(--ui-title-tracking); } p { margin: 6px 0 0; color: var(--color-text-muted); font-size: var(--ui-caption-size); line-height: 1.6; } small { display: block; margin-top: 4px; color: var(--color-text-muted); font-size: var(--ui-caption-size); }
`;
const BookMenu = styled(ContextMenu)`flex: none; width: 44px; > button { width: 44px; height: 44px; padding: 0; border-radius: 50%; color: var(--color-text-muted); &:hover { background: #e8ede4; } }`;
const Controls = styled.nav`display: flex; align-items: center; justify-content: center; gap: 18px; margin-top: 24px; > span { min-width: 74px; text-align: center; font-size: 12px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }`;
const Arrow = styled(BaseButton)`width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--color-brand-100); color: var(--color-brand-1000); &:hover:not(:disabled) { background: var(--color-brand-200); } &:disabled { opacity: .3; }`;
