"use client";

import styled from "@emotion/styled";
import type { HarumadiParticipant } from "@/shared/api/harumadiTogether";
import { harumadiParticipantIdentity } from "@/shared/harumadi/participant";
import { ContextMenu } from "./ContextMenu";

export function HarumadiParticipantList({ participants, viewerId, canManage, busy, onRemove }: {
  participants: HarumadiParticipant[]; viewerId: string; canManage: boolean; busy: boolean; onRemove: (userId: string) => void;
}) {
  return <List aria-label="함께 채우는 사람">{participants.map(person => {
    const identity = harumadiParticipantIdentity(person, viewerId);
    return <li key={person.userId}>
      <Identity><Name>{identity.name}{identity.showSelf && <Self>나</Self>}</Name><Role>{identity.role}</Role></Identity>
      {canManage && !person.owner && <ContextMenu label={`${identity.name} 참여자 관리`} disabled={busy}
        items={[{ label: "내보내기", tone: "danger", onSelect: () => onRemove(person.userId) }]} />}
    </li>;
  })}</List>;
}

const List = styled.ul`margin: 0; padding: 0; list-style: none;
  li { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--color-border); }
  li:last-child { border-bottom: 0; }
`;
const Identity = styled.div`min-width: 0; flex: 1; display: grid; gap: 6px;`;
const Name = styled.strong`display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; font-size: var(--ui-body-size); font-weight: 500; line-height: 1.6; overflow-wrap: anywhere;`;
const Self = styled.span`font-size: 12px; font-weight: 500; line-height: 1.6; padding: 1px 7px; border-radius: 999px; background: var(--color-brand-100); color: var(--color-brand-900);`;
const Role = styled.span`font-size: var(--ui-caption-size); line-height: 1.6; color: var(--color-text-muted);`;
