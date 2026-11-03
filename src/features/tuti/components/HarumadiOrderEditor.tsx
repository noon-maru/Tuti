"use client";

import styled from "@emotion/styled";
import { ArrowDown, ArrowUp, GripVertical, FileText } from "lucide-react";
import Image from "next/image";
import type { RefObject } from "react";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { orderByEntryIds } from "@/shared/harumadi/order";
import { BaseButton } from "./buttons";
import { useHarumadiOrderDrag } from "../hooks/useHarumadiOrderDrag";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

export function HarumadiOrderEditor({ entries, ids, onChange, disabled, scrollRef }: {
  entries: TutiJournalEntry[];
  ids: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { dragging, announcement, listRef, registerRow, move, pointerDown, pointerMove, finish } =
    useHarumadiOrderDrag({ ids, onChange, disabled, scrollRef });
  const ordered = orderByEntryIds(entries, ids);

  return <Section aria-label="마디 순서 편집">
    <h1>마디 순서 바꾸기</h1>
    <p>손잡이를 끌거나 화살표로 순서를 바꿔보세요.</p>
    <List ref={listRef} aria-label="하루마디에 담긴 마디" onPointerMove={pointerMove}
      onPointerUp={event => finish(false, event.pointerId)} onPointerCancel={event => finish(true, event.pointerId)} onLostPointerCapture={event => finish(true, event.pointerId)}>
      {ordered.map((entry, index) => <Row ref={registerRow(entry.id)} key={entry.id} data-order-entry={entry.id} data-dragging={dragging === entry.id || undefined}>
        <Handle type="button" disabled={disabled} aria-label={`${index + 1}번째 ${entry.title || entry.placeName || "마디"} 순서 이동`}
          onPointerDown={event => pointerDown(event, entry.id)}
          onKeyDown={event => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault(); move(entry.id, index + (event.key === "ArrowUp" ? -1 : 1));
            }
          }}><GripVertical size={20} aria-hidden="true" /></Handle>
        <Number aria-hidden="true">{index + 1}</Number>
        <Thumbnail>{entry.image ? <Image src={entry.image} alt="" fill unoptimized sizes="44px" /> : <FileText size={20} aria-hidden="true" />}</Thumbnail>
        <Copy><strong>{entry.title || entry.placeName || "남긴 하루"}</strong>
          <small>{dateFormatter.format(new Date(entry.visitedAt))}{entry.authorName ? ` · ${entry.authorName}` : ""}</small>
          <span>{entry.content.trim() || "사진으로 남긴 순간"}</span>
        </Copy>
        <Actions>
          <Move type="button" disabled={disabled || Boolean(dragging) || index === 0} aria-label={`${index + 1}번째 마디 위로 이동`} onClick={() => move(entry.id, index - 1)}><ArrowUp size={17} aria-hidden="true" /></Move>
          <Move type="button" disabled={disabled || Boolean(dragging) || index === ids.length - 1} aria-label={`${index + 1}번째 마디 아래로 이동`} onClick={() => move(entry.id, index + 1)}><ArrowDown size={17} aria-hidden="true" /></Move>
        </Actions>
      </Row>)}
    </List>
    <Status role="status" aria-live="polite" aria-atomic="true">{announcement}</Status>
  </Section>;
}

const Section = styled.section`
  h1 { font-size: 24px; font-weight: 600; line-height: 1.5; }
  > p { margin: 10px 0 24px; font-size: 14px; line-height: 1.7; color: var(--color-text-muted); }
`;
const List = styled.ol`position: relative; isolation: isolate; display: grid; gap: 10px; list-style: none; padding: 0; margin: 0;`;
const Row = styled.li`
  display: grid; grid-template-columns: 36px 22px 44px minmax(0, 1fr) 44px; align-items: center; gap: 8px;
  padding: 12px 8px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface);
  position: relative; z-index: 0; transition: box-shadow 180ms ease;
  &[data-dragging="true"] {
    z-index: 2; pointer-events: none; will-change: transform;
    border-color: var(--color-brand-700); background: var(--color-brand-100);
    box-shadow: 0 12px 26px rgb(27 34 42 / .16);
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  @media (max-width: 360px) { grid-template-columns: 32px 18px 40px minmax(0, 1fr) 40px; gap: 5px; }
`;
const Thumbnail = styled.span`
  position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 5;
  overflow: hidden; border-radius: 5px; background: var(--color-secondary-100); color: var(--color-text-muted);
  img { object-fit: cover; }
`;
const Handle = styled(BaseButton)`
  min-height: 48px; padding: 0; color: var(--color-text-muted); cursor: grab; touch-action: none;
  &:active { cursor: grabbing; }
  &:disabled { cursor: default; }
`;
const Number = styled.span`font-size: 13px; color: var(--color-text-muted); font-variant-numeric: tabular-nums;`;
const Copy = styled.div`
  min-width: 0; display: grid; gap: 4px;
  strong { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  small, span { color: var(--color-text-muted); font-size: 12px; line-height: 1.6; }
  span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
const Actions = styled.div`display: grid; gap: 2px;`;
const Move = styled(BaseButton)`
  min-height: 40px; padding: 0; border: 1px solid var(--color-border); border-radius: 9px;
  background: var(--color-white); color: var(--color-text);
  &:disabled { opacity: .3; }
`;
const Status = styled.p`min-height: 24px; margin-top: 12px; color: var(--color-text-muted); font-size: 12px;`;
