"use client";

import styled from "@emotion/styled";
import type { HarumadiParticipant } from "@/shared/api/harumadiTogether";
import { harumadiParticipantIdentity } from "@/shared/harumadi/participant";
import { TextButton } from "./buttons";

export function HarumadiParticipantList({ participants, viewerId, canManage, busy, onRemove }: {
  participants: HarumadiParticipant[]; viewerId: string; canManage: boolean; busy: boolean; onRemove: (userId: string) => void;
}) {
  return <List aria-label="함께 채우는 사람">{participants.map(person => {
    const identity = harumadiParticipantIdentity(person, viewerId);
    return <li key={person.userId}>
      <Identity><Name>{identity.name}{identity.showSelf && <Self>나</Self>}</Name><Role>{identity.role}</Role></Identity>
      {canManage && !person.owner && <Remove type="button" disabled={busy} aria-label={`${identity.name} 내보내기`} onClick={() => onRemove(person.userId)}>내보내기</Remove>}
    </li>;
  })}</List>;
}

const List = styled.ul`margin: 0; padding: 0; list-style: none;
  li { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--color-border); }
  li:last-child { border-bottom: 0; }
`;
const Identity = styled.div`min-width: 0; flex: 1; display: grid; gap: 6px;`;
const Name = styled.strong`display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; font-size: var(--ui-body-size); font-weight: 500; line-height: 1.6; overflow-wrap: anywhere;`;
const Self = styled.span`font-size: 12px; font-weight: 500; color: var(--color-brand-900);`;
const Role = styled.span`font-size: var(--ui-caption-size); line-height: 1.6; color: var(--color-text-muted);`;
const Remove = styled(TextButton)`min-height: 44px; padding: 8px; flex: none; font-size: 13px;`;
