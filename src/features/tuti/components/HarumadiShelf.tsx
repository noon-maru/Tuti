"use client";
import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { HarumadiCover } from "./HarumadiCover";
import { BaseButton } from "./buttons";
import { ContextMenu } from "./ContextMenu";
import { harumadiActions, type HarumadiOpeningMode } from "../navigation/harumadiActions";
import type { Harumadi } from "@/shared/api/harumadi";
import { spineColumnCount, type HarumadiLibraryView } from "@/shared/harumadi/libraryView";
import { harumadiAccessibleTitle, harumadiHintExtraHeight } from "@/shared/harumadi/titleHints";
import { HarumadiTitleHint } from "./HarumadiTitleHint";

export function HarumadiShelf({ books, ownerId, view, onOpen }: {
  books: Harumadi[]; ownerId: string; view: Exclude<HarumadiLibraryView, "carousel">;
  onOpen: (book: Harumadi, control: HTMLElement, mode?: HarumadiOpeningMode) => void;
}) {
  const shelf = useRef<HTMLDivElement>(null);
  const [spineColumns, setSpineColumns] = useState(4);
  useEffect(() => {
    const node = shelf.current;
    if (!node || view !== "spines") return;
    const measure = () => { if (node.clientWidth > 0) setSpineColumns(spineColumnCount(node.clientWidth)); };
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [view]);
  const spines = view === "spines", columns = spines ? spineColumns : 2;
  return <ShelfContent ref={shelf} data-library-view={view}>
    {Array.from({ length: Math.ceil(books.length / columns) }, (_, row) => {
      const rowBooks = books.slice(row * columns, (row + 1) * columns);
      const hintRows = rowBooks.some(book => book.duplicateTitle) ? (rowBooks.some(book => book.duplicateTitle && book.role === "contributor") ? 2 : 1) : 0;
      return <ShelfRow key={rowBooks[0].id} $spines={spines} $hintRows={hintRows}>
      <HarumadiGrid $spines={spines} $columns={columns}>{rowBooks.map(book => <HarumadiCard key={book.id} data-harumadi-card>
        <HarumadiButton data-book-cover type="button" aria-label={`${harumadiAccessibleTitle(book)}, 마디 ${book.entryIds.length}개 열기`} onClick={event => onOpen(book, event.currentTarget)}>
          {spines ? <HarumadiSpine book={book} /> : <HarumadiCover harumadiPdf={{ ...book, entryCount: book.entryIds.length, pageCount: 0, hasCover: book.coverStyle.endsWith("-image") && book.entryIds.length > 0 }} ownerId={ownerId} kind="harumadi" />}
          <HarumadiLabel $spines={spines} $hintRows={hintRows}><strong>{book.title}</strong><small>{book.entryIds.length ? `마디 ${book.entryIds.length}개` : spines ? "빈 하루마디" : "첫 마디를 기다려요"}{book.shared ? " · 함께" + (spines ? "" : " 채우는 중") : ""}</small><HarumadiTitleHint book={book} />{book.role === "contributor" && <small>{book.ownerName}님의 하루마디</small>}</HarumadiLabel>
        </HarumadiButton><BookMenu $spines={spines} $hintRows={hintRows} label={`${harumadiAccessibleTitle(book)} 메뉴`} triggerContent={<MoreVertical size={22} />} items={harumadiActions(book).map(action => ({ label: action.label, singleLine: true, onSelect: trigger => onOpen(book, trigger, action.mode) }))} />
      </HarumadiCard>)}</HarumadiGrid><ShelfEdge aria-hidden="true" />
    </ShelfRow>; })}
  </ShelfContent>;
}

/** No photos or content requests: a spine only needs the book's list metadata. */
export function HarumadiSpine({ book }: { book: Harumadi }) {
  return <Spine $green={book.coverStyle.startsWith("green")} data-harumadi-spine title={book.title}>
    <span className="spine-date">{book.shared ? "함께" : new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(book.createdAt))}</span>
    <strong>{book.title}</strong><span className="spine-mark">Tuti</span>
  </Spine>;
}
const ShelfContent = styled.div`flex: none; width: 100%; margin-block: auto; padding-block: 16px; > div:last-child { margin-bottom: 0; }`;
const Spine = styled.span<{ $green: boolean }>`
  display: block; position: relative; box-sizing: border-box; width: 100%; max-width: 80px; height: 224px; margin: 0 auto; overflow: hidden;
  border: 1px solid #dce3d6; border-radius: 4px 5px 2px 2px; background: ${({ $green }) => $green ? "#EBF5D5" : "#FFFFFF"}; color: var(--color-text);
  box-shadow: inset 4px 0 8px #1b222a06, inset -3px 0 5px #1b222a04, 3px 2px 0 #e3e8de, 4px 7px 12px #1b222a0c;
  &::before { content: ""; position: absolute; inset: 0 auto 0 5px; border-left: 1px solid #1b222a08; }
  strong { position: absolute; top: 43px; bottom: 43px; left: 50%; transform: translateX(-50%); writing-mode: vertical-rl; text-orientation: mixed; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 15px; line-height: 1.5; font-weight: 600; letter-spacing: .04em; }
  .spine-date, .spine-mark { position: absolute; left: 8px; right: 8px; text-align: center; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
  .spine-date { top: 15px; font-size: 9px; white-space: nowrap; }
  .spine-mark { bottom: 17px; font-size: 10px; letter-spacing: .03em; }
`;
const ShelfRow = styled.div<{ $spines: boolean; $hintRows: number }>`margin-bottom: 36px; position: relative; flex: none; > div:last-child { position: absolute; left: 0; right: 0; bottom: ${({ $spines }) => $spines ? 92 : 108}px; pointer-events: none; }
  ${({ $spines, $hintRows }) => $hintRows > 0 && `> div:last-child { bottom: ${($spines ? 92 : 108) + harumadiHintExtraHeight($spines, $hintRows)}px; }`}
`;
const HarumadiGrid = styled.div<{ $spines: boolean; $columns: number }>`display: grid; grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr)); gap: ${({ $spines }) => $spines ? 12 : 24}px; padding: 0 8px; align-items: end;`;
const HarumadiCard = styled.div`position: relative; min-width: 0;`;
const BookMenu = styled(ContextMenu)<{ $spines: boolean; $hintRows: number }>`position: absolute; right: -8px; bottom: 60px; width: 44px; height: 44px;
  ${({ $spines }) => $spines && "right: auto; left: 50%; bottom: 0; transform: translateX(-50%);"}
  ${({ $spines, $hintRows }) => !$spines && $hintRows > 0 && `bottom: ${60 + harumadiHintExtraHeight(false, $hintRows)}px;`}
  > button { width: 44px; height: 44px; padding: 0; border-radius: 18px; color: var(--color-text-muted); &:hover { background: #e8ede4; } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 1px; } }
`;
// 선반 두께 6px와 표지 아래 종이 단면 4px를 비워 책이 선반에 파묻히지 않게 한다.
const HarumadiButton = styled(BaseButton)`display: grid; gap: 10px; width: 100%; min-width: 0; padding: 0; text-align: left; background: transparent; color: inherit; overflow: visible;
  > span:first-of-type { transition: transform 180ms ease; } &:hover > span:first-of-type { transform: translateY(-5px); }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 7px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) { > span:first-of-type { transition: none; } &:hover > span:first-of-type { transform: none; } }
`;
const ShelfEdge = styled.div`height: 6px; border-radius: 1px 1px 3px 3px; background: linear-gradient(#ffffff, #e5e9e3); border-top: 1px solid white; box-shadow: 0 6px 10px rgb(27 34 42 / 0.06);`;
const HarumadiLabel = styled.span<{ $spines: boolean; $hintRows: number }>`min-width: 0; height: 108px; padding: 18px 0 12px 1px; display: grid; align-content: start; gap: 8px; strong { padding-right: 36px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font-size: 16px; line-height: 1.4; font-weight: 500; } small { color: var(--color-text-muted); font-size: 13px; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  ${({ $spines }) => $spines && "height: 92px; padding: 12px 0 44px; gap: 3px; text-align: center; strong { display: none; } small { font-size: 11px; }"}
  ${({ $spines, $hintRows }) => $hintRows > 0 && `height: ${($spines ? 92 : 108) + harumadiHintExtraHeight($spines, $hintRows)}px;`}
  ${({ $spines }) => $spines && "[data-harumadi-title-hint] { white-space: normal; font-size: 10px; line-height: 1.4; > span { display: block; } }"}
`;
