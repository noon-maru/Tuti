"use client";

import styled from "@emotion/styled";
import { BookOpen, ChevronDown, Plus, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import type { HarumadiTogether } from "@/shared/api/harumadiTogether";
import { harumadiParticipantIdentity } from "@/shared/harumadi/participant";
import { harumadiTogetherPhase } from "@/shared/harumadi/togetherPresentation";
import { screenTitleStyles, bodyCopyStyles, captionStyles } from "@/shared/ui/typography";
import { BaseButton, PrimaryButton, TextButton } from "./buttons";
import { LoadingIndicator } from "./LoadingIndicator";
import { HarumadiParticipantList } from "./HarumadiParticipantList";
import type { TogetherConfirmationAction } from "./HarumadiTogetherConfirmDialog";

type Props = {
  viewerId: string; bookTitle?: string; data?: HarumadiTogether;
  loading: boolean; error?: string; busy: boolean; notice: string; reuseInvite: boolean;
  notification?: ReactNode; management?: ReactNode;
  onInvite: () => void; onRevoke: (id: string) => void;
  onConfirm: (action: TogetherConfirmationAction, target?: string) => void;
  onRetry: () => void; onAccount: () => void;
};

export function HarumadiTogetherView({ viewerId, bookTitle, data, loading, error, busy, notice, reuseInvite,
  notification, management, onInvite, onRevoke, onConfirm, onRetry, onAccount,
}: Props) {
  const phase = data ? harumadiTogetherPhase(data) : null;
  const creator = data?.participants.find(person => person.owner);
  const identity = creator ? harumadiParticipantIdentity(creator, viewerId) : null;
  const ready = !loading && !error && data;
  return <Panel aria-labelledby="together-title" aria-busy={busy || loading}>
    <Heading><h1 id="together-title">함께 채우기</h1>
      {bookTitle?.trim() && <BookContext><BookOpen size={16} aria-hidden="true" /><span>{bookTitle}</span></BookContext>}
    </Heading>
    {loading ? <Status><LoadingIndicator label="함께할 사람을 확인하고 있어요." /></Status> : error || !data ?
      <Status role="alert"><h2>함께 채우기를 불러오지 못했어요.</h2><p>{error || "연결을 확인하고 다시 시도해주세요."}</p><PrimaryButton type="button" onClick={onRetry}>다시 불러오기</PrimaryButton></Status> : <>
        {phase !== "together" ? <Invitation aria-labelledby="invitation-title">
          <InvitationCopy><h2 id="invitation-title">{phase === "waiting" ? <>초대 수락을<br />기다리고 있어요.</> : <>함께 남길 사람을<br />초대해보세요.</>}</h2>
            <p>{phase === "waiting" ? "수락하면 상대방 책장에도 이 하루마디가 보여요." : "서로의 순간을, 한 권에 모아요."}</p>
          </InvitationCopy>
          {identity && <Creator><span>만든 사람</span><strong>{identity.name}</strong>{identity.showSelf && <Self>나</Self>}</Creator>}
          <ShareScope />
          <InviteAction type="button" disabled={busy} onClick={onInvite}><UserPlus size={19} aria-hidden="true" />{reuseInvite ? "초대 링크 다시 보내기" : phase === "waiting" ? "한 명 더 초대하기" : "초대 링크 보내기"}</InviteAction>
          <InviteHint />
        </Invitation> : <People aria-labelledby="together-people-title">
          <SectionHeading><h2 id="together-people-title">함께 채우는 사람</h2><span>{data.participants.length}명</span></SectionHeading>
          <HarumadiParticipantList participants={data.participants} viewerId={viewerId} canManage={data.owner} busy={busy} onRemove={id => onConfirm("remove-member", id)} />
          <ShareScope />
          {data.owner && <><AddPerson type="button" disabled={busy} onClick={onInvite}><Plus size={18} aria-hidden="true" />{reuseInvite ? "초대 링크 다시 보내기" : "함께할 사람 추가"}</AddPerson><InviteHint /></>}
        </People>}
        {notice && <Notice role="status">{notice}</Notice>}
        <Preferences>
          {data.owner && data.invites.length > 0 && <Fold>
            <summary><span>보낸 초대 <Count>{data.invites.length}</Count></span><ChevronDown size={17} aria-hidden="true" /></summary>
            <InviteList aria-label="수락 대기 중인 초대">{data.invites.map((invite, index) => <li key={invite.id}>
              <div><strong>초대 {index + 1}</strong><small>{new Date(invite.expiresAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 만료 · 수락 대기</small></div>
              <TextButton type="button" disabled={busy} aria-label={`초대 ${index + 1} 취소`} onClick={() => onRevoke(invite.id)}>취소</TextButton>
            </li>)}</InviteList>
          </Fold>}
          {data.shared && notification}
          {management && <Fold><summary><span>마디·신고 관리</span><ChevronDown size={17} aria-hidden="true" /></summary>{management}</Fold>}
        </Preferences>
        {data.owner && data.shared && <EndSection><Danger type="button" disabled={busy} onClick={() => onConfirm("end-together")}>함께 채우기 종료</Danger><p>초대와 참여를 모두 해제해요.<br />각자의 원본 마디와 저장한 PDF는 남아요.</p></EndSection>}
        {!data.owner && <EndSection><Danger type="button" disabled={busy} onClick={() => onConfirm("leave")}>함께 채우기 나가기</Danger><p>내 책장에서 이 하루마디가 사라져요.<br />내 원본 마디와 저장한 PDF는 남아요.</p></EndSection>}
      </>}
    {ready && <AccountLink type="button" disabled={busy} onClick={onAccount}>로그인 계정 확인</AccountLink>}
  </Panel>;
}

function ShareScope() {
  return <Scope aria-label="공유 범위"><strong>이 하루마디에 담긴 마디만 공유해요.</strong>
    <p>다른 하루마디와 개인 마디 목록은 공유되지 않아요. 현재·앞으로 참여하는 사람은 담긴 마디를 보고 PDF 사본을 저장할 수 있어요.</p>
  </Scope>;
}
function InviteHint() {
  return <Hint>한 링크로 한 명 · 7일 동안 유효해요.<br />전달받은 사람도 수락할 수 있어요.</Hint>;
}

const Panel = styled.section`display: flex; flex-direction: column; min-width: 0; padding: 8px 0 24px; color: var(--color-text);`;
const Heading = styled.header`display: grid; gap: 10px; margin-bottom: 32px; h1 { ${screenTitleStyles} }`;
const BookContext = styled.p`display: flex; align-items: flex-start; gap: 8px; margin: 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.6; svg { flex: none; margin-top: 3px; } span { min-width: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }`;
const Invitation = styled.section`display: grid; gap: 0; min-width: 0;`;
const InvitationCopy = styled.div`padding: 8px 0 24px; h2 { margin: 0; font-size: 26px; font-weight: 600; line-height: 1.5; letter-spacing: -.025em; } p { ${bodyCopyStyles} margin: 12px 0 0; color: var(--color-text-muted); }
  @container app-viewport (max-height: 620px) { padding-top: 0; padding-bottom: 18px; h2 { font-size: 24px; } }
`;
const Creator = styled.div`display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; padding: 0 0 28px; font-size: 14px; line-height: 1.6; > span:first-child { color: var(--color-text-muted); } strong { min-width: 0; font-weight: 500; overflow-wrap: anywhere; }`;
const Self = styled.span`color: var(--color-brand-900); font-size: 12px;`;
const Scope = styled.div`margin: 0 0 20px; strong { font-size: 14px; line-height: 1.7; font-weight: 500; } p { margin: 6px 0 0; font-size: 13px; line-height: 1.85; color: var(--color-text-muted); overflow-wrap: anywhere; }`;
const InviteAction = styled(PrimaryButton)`display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 52px; white-space: normal;`;
const Hint = styled.p`${captionStyles} margin: 12px 0 0; line-height: 1.8;`;
const People = styled.section`min-width: 0; > [aria-label="공유 범위"] { margin-top: 24px; }`;
const SectionHeading = styled.div`display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.6; } > span { color: var(--color-text-muted); font-size: 13px; font-variant-numeric: tabular-nums; }`;
const AddPerson = styled(BaseButton)`display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; width: 100%; padding: 10px 14px; border: 1px solid var(--color-brand-300); border-radius: 999px; background: var(--color-brand-100); color: var(--color-brand-1000); font-size: 15px; font-weight: 500; &:hover:not(:disabled) { background: var(--color-brand-200); } &:disabled { opacity: .55; }`;
const Preferences = styled.div`display: grid; min-width: 0; margin-top: 32px; border-top: 1px solid var(--color-border); > * { border-bottom: 1px solid var(--color-border); }`;
const Fold = styled.details`min-width: 0; summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 56px; padding: 12px 0; list-style: none; cursor: pointer; font-size: 14px; font-weight: 500; } summary::-webkit-details-marker { display: none; } summary > svg { flex: none; color: var(--color-text-muted); transition: transform 180ms ease; } &[open] > summary > svg { transform: rotate(180deg); } summary:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -2px; border-radius: 6px; } @media (prefers-reduced-motion: reduce) { summary > svg { transition: none; } }`;
const Count = styled.span`margin-left: 6px; color: var(--color-text-muted); font-size: 13px; font-weight: 400; font-variant-numeric: tabular-nums;`;
const InviteList = styled.ul`padding: 0 0 12px; margin: 0; list-style: none; li { display: flex; gap: 12px; align-items: center; padding: 10px 0; } li > div { flex: 1; min-width: 0; } strong { font-size: 14px; font-weight: 500; } small { display: block; margin-top: 4px; color: var(--color-text-muted); font-size: 12px; line-height: 1.6; } button { min-height: 44px; flex: none; padding: 8px; }`;
const EndSection = styled.section`margin-top: 28px; p { ${captionStyles} margin: 4px 0 0; line-height: 1.8; }`;
const Danger = styled(TextButton)`min-height: 44px; padding: 8px 0; text-align: left; font-size: 14px; color: var(--color-error);`;
const AccountLink = styled(TextButton)`align-self: flex-start; min-height: 44px; margin-top: 24px; padding: 8px 0; font-size: 13px; color: var(--color-text-muted);`;
const Status = styled.div`display: grid; align-content: center; gap: 16px; min-height: 260px; h2 { font-size: 16px; font-weight: 500; line-height: 1.7; margin: 0; } p { ${bodyCopyStyles} margin: 0; overflow-wrap: anywhere; color: var(--color-text-muted); }`;
const Notice = styled.p`margin: 20px 0 0; padding: 12px 14px; border-radius: 12px; background: var(--color-secondary-100); color: var(--color-secondary-1000); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere;`;
