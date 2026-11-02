"use client";

import styled from "@emotion/styled";
import { ArrowDown, ArrowUp, GripVertical, FileText } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { moveEntry, orderByEntryIds } from "@/shared/harumadi/order";
import { BaseButton } from "./buttons";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

export function HarumadiOrderEditor({ entries, ids, onChange, disabled, scrollRef }: {
  entries: TutiJournalEntry[];
  ids: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pointer = useRef<{ id: number; entryId: string; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const ordered = orderByEntryIds(entries, ids);
  const move = useCallback((id: string, target: number) => {
    if (disabled || target < 0 || target >= ids.length || ids.indexOf(id) === target) return;
    onChange(moveEntry(ids, id, target));
    setAnnouncement(`${target + 1}번째로 옮겼어요.`);
  }, [disabled, ids, onChange]);
  const moveAtPoint = useCallback((x: number, y: number) => {
    const active = pointer.current;
    if (!active?.moved) return;
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-order-entry]");
    if (target?.dataset.orderEntry) move(active.entryId, ids.indexOf(target.dataset.orderEntry));
  }, [ids, move]);
  useEffect(() => {
    if (!dragging || disabled) return;
    let frame = 0;
    const tick = () => {
      const active = pointer.current, scroller = scrollRef.current;
      if (!active || !scroller) return;
      const bounds = scroller.getBoundingClientRect();
      const delta = active.y < bounds.top + 48 ? -10 : active.y > bounds.bottom - 48 ? 10 : 0;
      if (delta) {
        scroller.scrollBy({ top: delta });
        moveAtPoint(active.x, Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, active.y)));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging, disabled, scrollRef, moveAtPoint]);
  const pointerDown = (event: PointerEvent<HTMLButtonElement>, entryId: string) => {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    pointer.current = { id: event.pointerId, entryId, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = pointer.current;
    if (disabled || !active || active.id !== event.pointerId) return;
    if (!active.moved && Math.abs(event.clientY - active.startY) < 6) return;
    active.moved = true;
    active.x = event.clientX; active.y = event.clientY;
    setDragging(active.entryId);
    moveAtPoint(event.clientX, event.clientY);
  };
  const finish = () => { pointer.current = null; setDragging(null); };

  return <Section aria-label="마디 순서 편집">
    <h1>마디 순서 바꾸기</h1>
    <p>손잡이를 끌거나 화살표로 순서를 바꿔보세요.</p>
    <List aria-label="하루마디에 담긴 마디">
      {ordered.map((entry, index) => <Row key={entry.id} data-order-entry={entry.id} data-dragging={dragging === entry.id || undefined}>
        <Handle type="button" disabled={disabled} aria-label={`${index + 1}번째 ${entry.title || entry.placeName || "마디"} 순서 이동`}
          onPointerDown={event => pointerDown(event, entry.id)} onPointerMove={pointerMove}
          onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
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
          <Move type="button" disabled={disabled || index === 0} aria-label={`${index + 1}번째 마디 위로 이동`} onClick={() => move(entry.id, index - 1)}><ArrowUp size={17} aria-hidden="true" /></Move>
          <Move type="button" disabled={disabled || index === ids.length - 1} aria-label={`${index + 1}번째 마디 아래로 이동`} onClick={() => move(entry.id, index + 1)}><ArrowDown size={17} aria-hidden="true" /></Move>
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
const List = styled.ol`display: grid; gap: 10px; list-style: none; padding: 0; margin: 0;`;
const Row = styled.li`
  display: grid; grid-template-columns: 36px 22px 44px minmax(0, 1fr) 44px; align-items: center; gap: 8px;
  padding: 12px 8px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface);
  &[data-dragging="true"] { border-color: var(--color-brand-700); background: var(--color-brand-100); }
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
