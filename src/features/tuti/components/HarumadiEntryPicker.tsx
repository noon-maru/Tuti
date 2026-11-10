"use client";

import styled from "@emotion/styled";
import Image from "next/image";
import { useId, useMemo, useState } from "react";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { groupHarumadiSelection, toggleHarumadiSelection } from "@/shared/harumadi/selection";
import { journalCardPreview } from "@/shared/tuti/journalCard";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { BaseButton, PrimaryButton } from "./buttons";
import { MadiSearchField } from "./MadiSearchField";

export function HarumadiEntryPicker({ entries, selected, onChange, disabled }: {
  entries: TutiJournalEntry[]; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const id = useId();
  const groups = useMemo(() => groupHarumadiSelection(entries, search), [entries, search]);
  const preview = entries.find(entry => entry.id === previewId);
  const found = groups.reduce((count, group) => count + group.entries.length, 0);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  return <section aria-label="하루마디에 담을 마디 선택">
    <MadiSearchField value={search} onChange={setSearch} />
    <Count role="status" aria-live="polite">{found}개 마디 · {selected.length}개 선택</Count>
    {!groups.length && <Empty>검색한 마디가 없어요. 다른 단어나 날짜로 찾아보세요.</Empty>}
    {groups.map(group => <Group key={group.key} aria-labelledby={`${id}-${group.key || "unknown"}`}>
      <h2 id={`${id}-${group.key || "unknown"}`}>{group.label}</h2>
      <List>{group.entries.map(entry => {
        const copy = journalCardPreview(entry);
        const heading = copy.heading || (entry.image ? "사진으로 남긴 순간" : "남긴 이야기");
        return <Row key={entry.id} data-selected={selectedSet.has(entry.id)}>
          <Choice><input type="checkbox" checked={selectedSet.has(entry.id)} disabled={disabled} onChange={() => onChange(toggleHarumadiSelection(selected, entry.id))} />
            <Thumbnail aria-hidden="true">{entry.image ? <Image src={entry.image} alt="" fill unoptimized sizes="60px" /> : <TextThumbnail>{entry.title && <strong>{entry.title}</strong>}{entry.content}</TextThumbnail>}</Thumbnail>
            <Copy><strong>{heading}</strong><Excerpt>{copy.excerpt || "사진으로 남긴 순간"}</Excerpt>{copy.place && <small>{copy.place}</small>}</Copy>
          </Choice>
          <Preview type="button" disabled={disabled} aria-label={`${group.label} ${heading} 미리보기`} onClick={() => setPreviewId(entry.id)}>미리보기</Preview>
        </Row>;
      })}</List>
    </Group>)}
    {preview && <AppDialogFrame role="dialog" titleId={`${id}-preview`} onCancel={() => setPreviewId(null)}>
      <h2 id={`${id}-preview`}>{preview.title || (preview.image ? "사진으로 남긴 순간" : "남긴 이야기")}</h2>
      {preview.image && <PreviewImage><Image src={preview.image} alt="선택할 마디의 사진" fill unoptimized sizes="390px" /></PreviewImage>}
      {preview.content && <p>{preview.content}</p>}
      <PrimaryButton type="button" onClick={() => setPreviewId(null)}>선택 목록으로</PrimaryButton>
    </AppDialogFrame>}
  </section>;
}

const Count = styled.p`margin: 12px 0 20px; font-size: var(--ui-caption-size); line-height: 1.6; color: var(--color-text-muted);`;
const Group = styled.section`margin-top: 24px; h2 { font-size: 14px; font-weight: 600; line-height: 1.5; margin: 0 0 10px; }`;
const List = styled.div`display: grid; gap: 10px;`;
const Row = styled.div`padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 12px; &[data-selected="true"] { border-color: var(--color-brand-700); background: var(--color-brand-100); } &:has(input:focus-visible) { outline: 2px solid var(--color-brand-800); outline-offset: -2px; }`;
const Choice = styled.label`display: flex; align-items: center; gap: 12px; min-height: 80px; cursor: pointer; input { width: 18px; height: 18px; flex: none; margin: 0; accent-color: var(--color-brand-800); } &:has(input:disabled) { cursor: default; opacity: .6; }`;
const Thumbnail = styled.span`position: relative; display: block; width: 60px; height: 80px; flex: none; overflow: hidden; border-radius: 6px; background: var(--color-secondary-100); &:has(img) { height: 45px; } img { object-fit: cover; }`;
const TextThumbnail = styled.span`display: block; padding: 8px; color: var(--color-secondary-1000); font-size: 8px; line-height: 1.7; strong { display: block; margin-bottom: 4px; }`;
const Copy = styled.span`display: grid; gap: 4px; min-width: 0; > strong { font-size: 15px; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; } small { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }`;
const Excerpt = styled.span`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; color: var(--color-text-muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere;`;
const Preview = styled(BaseButton)`display: block; min-height: 44px; margin: 4px 0 -6px auto; padding: 8px; color: var(--color-brand-900); background: transparent; font-size: 13px;`;
const Empty = styled.p`padding: 20px 0; font-size: 14px; line-height: 1.7; color: var(--color-text-muted);`;
const PreviewImage = styled.div`position: relative; width: min(100%, calc(40dvh * 4 / 3)); aspect-ratio: 4 / 3; margin-inline: auto; img { object-fit: cover; }`;
