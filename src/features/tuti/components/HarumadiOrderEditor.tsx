"use client";

import styled from "@emotion/styled";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
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

  return <Section aria-label="마디 순서 편집" data-order-editor>
    <Heading><div><h1>마디 순서</h1><p>읽고 싶은 순서로 놓아보세요.</p></div><Count>{ordered.length}마디</Count></Heading>
    <Hint><GripVertical size={15} aria-hidden="true" />오른쪽 손잡이를 위아래로 끌어보세요.</Hint>
    <List ref={listRef} aria-label="하루마디에 담긴 마디" onPointerMove={pointerMove}
      onPointerUp={event => finish(false, event.pointerId)} onPointerCancel={event => finish(true, event.pointerId)} onLostPointerCapture={event => finish(true, event.pointerId)}>
      {ordered.map((entry, index) => <Row ref={registerRow(entry.id)} key={entry.id} data-order-entry={entry.id} data-dragging={dragging === entry.id || undefined}>
        <Thumbnail>{entry.image ? <Image src={entry.image} alt="" fill unoptimized sizes="68px" /> : <TextThumbnail aria-hidden="true"><span>{entry.title || "남긴 하루"}</span>{entry.content.trim()}</TextThumbnail>}
          <Number aria-hidden="true">{String(index + 1).padStart(2, "0")}</Number>
        </Thumbnail>
        <Copy><small>{dateFormatter.format(new Date(entry.visitedAt))}</small><strong>{entry.title || entry.placeName || "남긴 하루"}</strong>
          <Excerpt>{entry.content.trim() || "사진으로 남긴 순간"}</Excerpt>
          {entry.authorName && <Author>{entry.authorName}</Author>}
        </Copy>
        <Actions>
          <Move type="button" disabled={disabled || Boolean(dragging) || index === 0} aria-label={`${index + 1}번째 마디 위로 이동`} onClick={() => move(entry.id, index - 1)}><ArrowUp size={15} aria-hidden="true" /></Move>
          <Handle type="button" disabled={disabled} aria-label={`${index + 1}번째 ${entry.title || entry.placeName || "마디"} 순서 이동`}
          onPointerDown={event => pointerDown(event, entry.id)}
          onKeyDown={event => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault(); move(entry.id, index + (event.key === "ArrowUp" ? -1 : 1));
            }
          }}><GripVertical size={21} aria-hidden="true" /></Handle>
          <Move type="button" disabled={disabled || Boolean(dragging) || index === ids.length - 1} aria-label={`${index + 1}번째 마디 아래로 이동`} onClick={() => move(entry.id, index + 1)}><ArrowDown size={15} aria-hidden="true" /></Move>
        </Actions>
      </Row>)}
    </List>
    <Status role="status" aria-live="polite" aria-atomic="true">{announcement}</Status>
  </Section>;
}

const Section = styled.section`
  overflow-anchor: none;
`;
const Heading = styled.div`
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px;
  && h1 { font-size: 24px; margin: 0 0 8px; font-weight: 600; line-height: 1.4; letter-spacing: -.04em; }
  p { margin: 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.6; }
`;
const Count = styled.span`flex: none; margin-top: 4px; padding: 5px 10px; border-radius: 20px; background: var(--color-secondary-100); color: var(--color-secondary-1000); font-size: 12px; font-weight: 600;`;
const Hint = styled.p`display: flex; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 12px; line-height: 1.7; color: var(--color-text-muted);`;
const List = styled.ol`position: relative; isolation: isolate; display: grid; gap: 12px; list-style: none; padding: 0; margin: 0; overflow-anchor: none;`;
const Row = styled.li`
  display: grid; grid-template-columns: 68px minmax(0, 1fr) 36px; align-items: center; gap: 14px;
  padding: 12px; border: 1px solid var(--color-neutral-400); border-radius: 16px; background: var(--color-surface);
  position: relative; z-index: 0; overflow-anchor: none; transition: box-shadow 240ms ease, border-color 240ms ease;
  &[data-dragging="true"] {
    z-index: 2; pointer-events: none; will-change: transform;
    border-color: var(--color-secondary-700);
    box-shadow: 0 8px 24px rgb(27 34 42 / .12), 0 2px 6px rgb(27 34 42 / .04);
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  @media (max-width: 360px) { grid-template-columns: 56px minmax(0, 1fr) 32px; gap: 10px; padding: 10px; }
`;
const Thumbnail = styled.span`
  position: relative; display: block; width: 100%; aspect-ratio: 3 / 4;
  overflow: hidden; border-radius: 7px; background: var(--color-secondary-100); color: var(--color-text-muted);
  box-shadow: inset 0 0 0 1px rgb(27 34 42 / .04);
  img { object-fit: cover; }
`;
const TextThumbnail = styled.span`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 5; overflow: hidden; padding: 10px 8px 20px; font-size: 8px; line-height: 1.8; color: var(--color-secondary-1000); span { display: block; font-weight: 600; margin-bottom: 4px; }`;
const Handle = styled(BaseButton)`
  display: grid; place-items: center; line-height: 1;
  min-height: 40px; width: 100%; padding: 0; border: 0; border-radius: 0; background: transparent;
  color: var(--color-neutral-1000); cursor: grab; touch-action: none;
  svg { display: block; }
  &:active { cursor: grabbing; }
  &:disabled { cursor: default; }
`;
const Number = styled.span`position: absolute; left: 0; bottom: 0; padding: 2px 7px; border-top-right-radius: 7px; background: var(--color-surface); color: var(--color-text); font-size: 11px; line-height: 1.7; font-weight: 600; font-variant-numeric: tabular-nums;`;
const Copy = styled.div`
  min-width: 0; display: grid; gap: 5px;
  strong { font-size: 16px; line-height: 1.5; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  small { color: var(--color-text-muted); font-size: 12px; line-height: 1.6; }
`;
const Excerpt = styled.span`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; color: var(--color-text-muted); font-size: 13px; line-height: 1.65; overflow-wrap: anywhere;`;
const Author = styled.span`font-size: 11px; color: var(--color-text-muted);`;
const Actions = styled.div`display: grid; grid-template-rows: 28px 40px 28px; align-self: center; justify-items: stretch; gap: 1px;`;
const Move = styled(BaseButton)`
  display: grid; place-items: center; width: 100%; line-height: 1;
  min-height: 28px; padding: 0; border-radius: 8px; background: transparent; color: var(--color-text-muted);
  svg { display: block; }
  &:disabled { opacity: .2; }
`;
const Status = styled.p`position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;`;
