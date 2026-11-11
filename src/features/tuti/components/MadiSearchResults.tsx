"use client";
import styled from "@emotion/styled";
import { ChevronRight } from "lucide-react";
import type { Ref } from "react";
import { BaseButton, TextButton } from "./buttons";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { journalCardPreview } from "@/shared/tuti/journalCard";
import { getKoreanDateKeyFromIso } from "@/lib/date/koreanDate";

export function MadiSearchResults({ entries, selectedId, selectedRef, onOpen, onCollect }: {
  entries: TutiJournalEntry[]; selectedId?: string; selectedRef?: Ref<HTMLButtonElement>;
  onOpen: (entry: TutiJournalEntry, target: HTMLButtonElement) => void;
  onCollect?: (entryId: string) => void;
}) {
  return <Results data-scroll-region aria-label="마디 검색 결과">
    <p role="status">마디 {entries.length}개</p>
    {entries.map(entry => {
      const preview = journalCardPreview(entry);
      return <ResultRow key={entry.id}><Result ref={entry.id === selectedId ? selectedRef : undefined} type="button"
        data-journal-transition-entry-id={entry.id} data-journal-transition-image={entry.image ?? undefined} data-journal-transition-surface="journal"
        onClick={event => onOpen(entry, event.currentTarget)}>
        <Thumbnail $image={entry.image ?? undefined} aria-hidden="true">{!entry.image && <span>{preview.heading || preview.excerpt || "마디"}</span>}</Thumbnail>
        <Copy><small>{getKoreanDateKeyFromIso(entry.visitedAt) ?? entry.visitedAt}{entry.placeName ? ` · ${entry.placeName}` : ""}</small><strong>{entry.title || preview.heading || "남긴 하루"}</strong><span>{preview.excerpt || entry.content}</span></Copy>
        <ChevronRight size={17} aria-hidden="true" />
      </Result>{onCollect && <Collect type="button" aria-label={`${entry.title || preview.heading || "마디"} 하루마디에 담기`} onClick={() => onCollect(entry.id)}>담기</Collect>}</ResultRow>;
    })}
  </Results>;
}
const Results = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; > p { margin: 0 0 8px; color: var(--color-text-muted); font-size: 12px; }`;
const ResultRow = styled.div`display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--color-border);`;
const Result = styled(BaseButton)`display: flex; flex: 1; min-width: 0; align-items: center; gap: 12px; width: 100%; min-height: 96px; padding: 12px 2px; border-radius: 0; text-align: left; background: transparent; > svg { flex: none; color: var(--color-text-muted); } &:hover { background: var(--color-brand-100); } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }`;
const Collect = styled(TextButton)`flex: none; min-width: 44px; min-height: 44px; padding: 8px 4px; font-size: 13px; color: var(--color-brand-900);`;
const Thumbnail = styled.span<{ $image?: string }>`flex: none; width: 52px; height: 68px; border-radius: 4px; overflow: hidden; background: var(--color-secondary-100); ${({ $image }) => $image && `width: 64px; height: 48px; background-image: url(${JSON.stringify($image)}); background-position: center; background-size: cover;`} padding: 6px; > span { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; color: var(--color-text-muted); font-size: 9px; line-height: 1.5; overflow-wrap: anywhere; }`;
const Copy = styled.span`flex: 1; min-width: 0; display: grid; gap: 5px; > small { color: var(--color-text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } > strong { font-size: 15px; font-weight: 500; overflow-wrap: anywhere; } > span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; line-height: 1.7; color: var(--color-text-muted); overflow-wrap: anywhere; }`;
