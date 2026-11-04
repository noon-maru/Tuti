"use client";

import { memo, useMemo } from "react";
import { css, keyframes } from "@emotion/react";
import { useQuery } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { fetchHarumadiContent, authoritativeReadError } from "@/lib/harumadiContent";
import { canCacheHarumadi, harumadiReadCache } from "@/lib/harumadiReadCache";
import type { Harumadi } from "@/shared/api/harumadi";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { buildHarumadiReaderPages, type HarumadiReaderPage } from "@/shared/harumadi/readerPages";
import { HarumadiPageSheet } from "./HarumadiSheet";
import { HarumadiCover } from "./HarumadiCover";
import { useCachedHarumadi } from "../hooks/useCachedHarumadi";

/** 첫 두 마디만 조판한다. 긴 첫 마디라면 오른쪽에는 실제 이어지는 쪽이 온다. */
export function buildHarumadiSpread(book: Harumadi, entries: TutiJournalEntry[]) {
  const ids = book.entryIds.slice(0, 2);
  return buildHarumadiReaderPages({ ...book, entryIds: ids }, entries.filter(entry => ids.includes(entry.id)), 320).slice(1, 3);
}

// 선택한 책만 조회한다. 드래그 프레임에서는 지면·사진을 다시 렌더하지 않는다.
export const HarumadiSpreadPreview = memo(function HarumadiSpreadPreview({ book, ownerId }: { book: Harumadi; ownerId: string }) {
  const query = useQuery({ queryKey: ["harumadi-content", ownerId, book.id],
    queryFn: ({ signal }) => fetchHarumadiContent(ownerId, book.id, signal),
    retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true,
    refetchInterval: book.shared ? 30_000 : false });
  useCachedHarumadi(ownerId, book.id, !book.shared);
  const read = query.data;
  const verified = query.isFetchedAfterMount && !query.isPaused && !query.error && read && !read.cached;
  const readable = read && harumadiReadCache.current(ownerId, book.id, read.ticket) && !authoritativeReadError(query.error) &&
    ((!book.shared && canCacheHarumadi(read.content)) || verified);
  const pages = useMemo(() => readable && read ? buildHarumadiSpread(read.content.harumadi, read.content.entries) : [], [readable, read]);
  // 최초 콘텐츠 준비 시에만 펼친다. 백그라운드 갱신은 같은 DOM을 유지해 재생하지 않는다.
  const ready = pages.length > 0 || query.isError;
  return <HarumadiSpreadSheets book={book} pages={pages} ready={ready} ownerId={ownerId} failed={query.isError} />;
});

/** 책장과 확대 전환이 동일한 두 지면을 사용한다. 전환에서는 조회·펼침을 반복하지 않는다. */
export function HarumadiSpreadSheets({ book, pages, ready = true, still = false, ownerId, failed = false }: {
  book: Harumadi; pages: HarumadiReaderPage[]; ready?: boolean; still?: boolean; ownerId?: string; failed?: boolean;
}) {
  return <Spread data-harumadi-spread-preview data-spread-ready={ready} data-spread-still={still} aria-hidden="true">
    {[0, 1].map(index => <Leaf key={index} $side={index === 0 ? "left" : "right"} data-book-opening-origin={index === 1 ? true : undefined}>
      {pages[index] ? <Miniature><HarumadiPageSheet page={pages[index]} coverStyle={book.coverStyle} number={index + 1} /></Miniature>
        : <Unwritten><span>{index === 0 ? failed ? "열어서 확인하기" : "마디를 펼치는 중" : ""}</span></Unwritten>}
    </Leaf>)}
    {!still && ownerId && <TurningCover data-spread-turning-cover><HarumadiCover ownerId={ownerId} kind="harumadi" harumadiPdf={{ ...book,
      entryCount: book.entryIds.length, pageCount: 0, hasCover: book.coverStyle.endsWith("-image") && book.entryIds.length > 0 }} /></TurningCover>}
  </Spread>;
}

const centerSpread = keyframes`from { transform: translateX(-25%); } to { transform: translateX(0); }`;
const unfoldLeft = keyframes`from { transform: rotateY(173deg); } to { transform: rotateY(7deg); }`;
const turnCover = keyframes`0% { transform: rotateY(0deg); opacity: 1; } 99% { opacity: 1; } 100% { transform: rotateY(-173deg); opacity: 0; }`;
const Spread = styled.span`position: relative; display: flex; width: 100%; aspect-ratio: 296 / 210; perspective: 900px; filter: drop-shadow(0 12px 12px #1b222a16);
  transform: translateX(-25%);
  &[data-spread-ready="true"] { animation: ${centerSpread} 900ms cubic-bezier(.33,0,.2,1) both; }
  &[data-spread-still="true"] { transform: none; animation: none; }
  @media (prefers-reduced-motion: reduce) { transform: none; animation: none !important; }
  &::after { content: ""; position: absolute; inset: 0 auto 0 50%; width: 1px; background: #cbd1c6; pointer-events: none; }
`;
const Leaf = styled.span<{ $side: "left" | "right" }>`position: relative; display: block; width: 50%; aspect-ratio: 148 / 210; overflow: hidden; background: white;
  border: 1px solid #e4e9e0; border-radius: ${({ $side }) => $side === "left" ? "5px 1px 1px 8px" : "1px 5px 8px 1px"};
  transform: ${({ $side }) => $side === "left" ? "rotateY(173deg)" : "rotateY(-7deg)"}; transform-origin: ${({ $side }) => $side === "left" ? "right center" : "left center"}; backface-visibility: hidden;
  ${({ $side }) => $side === "left" && `z-index: 1;`}
  ${({ $side }) => $side === "left" && css`[data-spread-ready="true"] > & { animation: ${unfoldLeft} 900ms cubic-bezier(.33,0,.2,1) both; }`}
  [data-spread-still="true"] > & { transform: ${({ $side }) => $side === "left" ? "rotateY(7deg)" : "rotateY(-7deg)"}; animation: none; }
  @media (prefers-reduced-motion: reduce) { transform: ${({ $side }) => $side === "left" ? "rotateY(7deg)" : "rotateY(-7deg)"}; animation: none !important; }
  &::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: ${({ $side }) => $side === "left" ? "linear-gradient(90deg, transparent 80%, #1b222a12)" : "linear-gradient(90deg, #1b222a10, transparent 18%)"}; }
`;
const TurningCover = styled.span`position: absolute; top: 0; left: 50%; width: 50%; z-index: 2; transform-origin: left center; backface-visibility: hidden; pointer-events: none;
  [data-spread-ready="true"] > & { animation: ${turnCover} 900ms cubic-bezier(.33,0,.2,1) both; }
  @media (prefers-reduced-motion: reduce) { display: none; animation: none !important; }
`;
// 읽기 화면과 같은 320px 지면을 축소해 여백과 줄바꿈의 비율을 보존한다.
const Miniature = styled.span`position: absolute; top: 0; left: 0; display: block; width: 320px; transform: scale(var(--spread-page-scale)); transform-origin: top left; pointer-events: none;`;
const Unwritten = styled.span`display: grid; place-items: center; height: 100%; padding: 12px; color: var(--color-text-muted); font-size: 10px; line-height: 1.7;`;
