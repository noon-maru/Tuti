"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { UserPlus } from "lucide-react";
import { BaseButton, PrimaryButton, TextButton } from "./buttons";
import { changeTogether, fetchTogether, shareHarumadiInvite } from "@/lib/harumadiTogether";
import { HarumadiSafetyActions } from "./HarumadiSafetyActions";
import { HarumadiTogetherConfirmDialog, type TogetherConfirmationAction } from "./HarumadiTogetherConfirmDialog";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { HarumadiNotificationToggle } from "./HarumadiNotificationToggle";
import { HarumadiParticipantList } from "./HarumadiParticipantList";
import { harumadiParticipantIdentity } from "@/shared/harumadi/participant";
import { screenTitleStyles, bodyCopyStyles, captionStyles } from "@/shared/ui/typography";
export function HarumadiTogetherPanel({ owner, bookId, onExit, entries = [] }: { owner: string; bookId: string; onExit: () => void; entries?: TutiJournalEntry[] }) {
  const client = useQueryClient(), router = useRouter();
  const query = useQuery({ queryKey: ["harumadi-together", owner, bookId], queryFn: () => fetchTogether(owner, bookId), retry: false });
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [pendingInvite, setPendingInvite] = useState<{ id: string; token: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ action: TogetherConfirmationAction; target?: string } | null>(null);
  const inFlight = useRef(false);
  const closeConfirmation = useCallback(() => { if (!inFlight.current) setConfirmation(null); }, []);
  const requestConfirmation = (type: TogetherConfirmationAction, target?: string) => {
    if (inFlight.current) return;
    setNotice(""); setConfirmation({ action: type, target });
  };
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["harumadi-together", owner, bookId] }), client.invalidateQueries({ queryKey: ["library-harumadis", owner] }), client.invalidateQueries({ queryKey: ["harumadi-content", owner, bookId] })]);
    client.removeQueries({ queryKey: ["library-cover", owner] });
  };
  const action = async (type: string, target?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setNotice("");
    try {
      if (type === "invite") {
        const invite = pendingInvite ?? await changeTogether<{ id: string; token: string }>(owner, bookId, "invite", undefined, { sharingConfirmed: true });
        setPendingInvite(invite);
        void refresh();
        const result = await shareHarumadiInvite(invite.token);
        if (result !== "cancelled") setPendingInvite(null);
        setNotice(result === "copied" ? "초대 링크를 복사했어요." : result === "cancelled" ? "공유를 취소했어요. 아래에서 초대도 취소할 수 있어요." : "수락하면 상대방 책장에도 같은 하루마디가 보여요.");
      } else {
        await changeTogether(owner, bookId, type, target);
        if (type === "revoke-invite" && target === pendingInvite?.id) setPendingInvite(null);
        if (type === "leave" || type === "end-together") {
          setPendingInvite(null);
          client.removeQueries({ queryKey: ["harumadi-content", owner, bookId] });
          client.removeQueries({ queryKey: ["harumadi-comments", owner, bookId] });
          await client.invalidateQueries({ queryKey: ["library-harumadis", owner] });
          client.removeQueries({ queryKey: ["harumadi-together", owner, bookId] });
          onExit(); return;
        }
        await refresh();
        setConfirmation(null);
        setNotice(type === "revoke-invite" ? "초대를 취소했어요." : type === "remove-entry" ? "이 책에서 마디를 뺐어요." : type === "remove-member" ? "참여자를 내보냈어요." : "요청을 완료했어요.");
      }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "요청을 완료하지 못했어요. 다시 시도해주세요."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Panel aria-labelledby="together-title" aria-busy={busy}>
    <Heading><h1 id="together-title">함께 채우기</h1><p>각자의 순간을 하나의 하루마디에 담아보세요.</p></Heading>
    <Disclosure aria-label="공유 범위">
      <strong>이 하루마디에 담긴 마디만 함께 봐요.</strong>
      <p>현재·앞으로 참여하는 사람들에게 보여요. 다른 하루마디와 개인 마디 목록은 공유되지 않아요. 참여자는 PDF 사본을 저장할 수 있어요.</p>
    </Disclosure>
    {query.isPending ? <p role="status">함께할 사람을 확인하고 있어요.</p> : query.isError ? <p role="alert">{query.error.message}<TextButton onClick={() => void query.refetch()}>다시 확인하기</TextButton></p> : <>
      {query.data.owner && <InviteSection aria-label="함께할 사람 초대">
        <InviteButton disabled={busy} onClick={() => void action("invite")}><UserPlus size={18} aria-hidden="true" />초대 링크 보내기</InviteButton>
        <small>한 링크로 한 명이 참여해요. 여러 명에게는 각각 보내주세요. 7일 동안 유효하며 전달받은 사람도 수락할 수 있어요.</small>
        {query.data.invites.length > 0 && <PendingInvites><summary>수락 기다리는 초대 {query.data.invites.length}개</summary><List aria-label="수락 대기 중인 초대">{query.data.invites.map((invite, index) => <li key={invite.id}><span>초대 {index + 1}<small>{new Date(invite.expiresAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 만료</small></span><TextButton disabled={busy} aria-label={`초대 ${index + 1} 취소`} onClick={() => void action("revoke-invite", invite.id)}>초대 취소</TextButton></li>)}</List></PendingInvites>}
      </InviteSection>}
      <Section aria-labelledby="together-people-title">
        <SectionTitle id="together-people-title">함께하는 사람 <span>{query.data.participants.length}명</span></SectionTitle>
        <HarumadiParticipantList participants={query.data.participants} viewerId={owner} canManage={query.data.owner} busy={busy} onRemove={userId => requestConfirmation("remove-member", userId)} />
        {query.data.owner && query.data.participants.length === 1 && <Hint>초대를 수락하면 여기에 함께하는 사람이 보여요.</Hint>}
      </Section>
      {query.data.shared && <Section><HarumadiNotificationToggle owner={owner} bookId={bookId} /></Section>}
    </>}
    {notice && <p role="status">{notice}</p>}
    {query.data && <Management><summary>담긴 마디·신고 관리</summary><List>{query.data.participants.filter(person => person.userId !== owner).map(person => <li key={person.userId}><span>{harumadiParticipantIdentity(person, owner).name}</span><HarumadiSafetyActions owner={owner} bookId={bookId} targetId={person.userId} authorId={person.userId} kind="user" onBlocked={onExit} /></li>)}</List><List>{entries.map(entry => <li key={entry.id}><span>{entry.title || entry.placeName || "남긴 마디"}<small>{entry.authorId === owner ? "내가 남긴 마디" : "함께 채운 마디"}</small></span>{(query.data.owner || entry.authorId === owner) && <TextButton disabled={busy} onClick={() => requestConfirmation("remove-entry", entry.id)}>책에서 빼기</TextButton>}{entry.authorId && <HarumadiSafetyActions owner={owner} bookId={bookId} targetId={entry.id} authorId={entry.authorId} kind="entry" onBlocked={onExit} />}</li>)}</List></Management>}
    {query.data && !query.data.owner && <EndSection><Danger disabled={busy} onClick={() => requestConfirmation("leave")}>함께 채우기 나가기</Danger><small>내 책장에서 이 하루마디가 사라져요. 내가 남긴 원본 마디와 저장한 PDF는 남아요.</small></EndSection>}
    {query.data && query.data.owner && query.data.shared && <EndSection><Danger disabled={busy} onClick={() => requestConfirmation("end-together")}>함께 채우기 종료</Danger><small>초대와 참여를 모두 해제하고 나만의 하루마디로 돌아가요.<br />각자의 원본 마디와 저장한 PDF는 남아요.</small></EndSection>}
    <AccountLink disabled={busy} onClick={() => router.push("/login")}>로그인 계정 확인</AccountLink>
    {confirmation && <HarumadiTogetherConfirmDialog action={confirmation.action} busy={busy} error={notice || undefined} onCancel={closeConfirmation} onConfirm={() => void action(confirmation.action, confirmation.target)} />}
  </Panel>;
}
const Panel = styled.section`display: flex; flex-direction: column; gap: 24px; padding: 8px 0 24px; h1 { ${screenTitleStyles} } p { ${bodyCopyStyles} margin: 0; } > small { ${captionStyles} }`;
const Heading = styled.header`display: grid; gap: 10px; p { color: var(--color-text-muted); }`;
const Disclosure = styled.div`padding: 16px; border-radius: 12px; background: var(--color-brand-100); color: var(--color-brand-1000); strong { display: block; font-size: 14px; font-weight: 500; line-height: 1.7; margin-bottom: 6px; } p { font-size: 13px; line-height: 1.85; }`;
const Section = styled.section`min-width: 0; padding-top: 4px;`;
const SectionTitle = styled.h2`margin: 0 0 4px; font-size: 16px; font-weight: 600; line-height: 1.6; span { margin-left: 6px; color: var(--color-text-muted); font-size: 13px; font-weight: 400; }`;
const Hint = styled.div`${captionStyles} margin-top: 8px;`;
const InviteSection = styled.section`display: grid; gap: 10px; min-width: 0; > small { ${captionStyles} }`;
const InviteButton = styled(PrimaryButton)`display: flex; align-items: center; justify-content: center; gap: 8px;`;
const Management = styled.details`border-top: 1px solid var(--color-border); padding-top: 12px; summary { min-height: 44px; padding: 10px 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.7; cursor: pointer; } summary:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -2px; border-radius: 6px; }`;
const PendingInvites = styled(Management)`border-top: 0; padding-top: 0;`;
const List = styled.ul`margin: 0; padding: 0; list-style: none; li { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--color-border); } li > span { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: var(--ui-body-size); } small { ${captionStyles} display: block; margin-top: 5px; } button { min-height: 44px; flex-shrink: 0; }`;
const Danger = styled(BaseButton)`min-height: 44px; padding: 10px 0; color: var(--color-error); background: transparent; text-align: left; font-size: 14px;`;
const EndSection = styled.div`display: grid; gap: 8px; padding-top: 16px; border-top: 1px solid var(--color-border); > small { ${captionStyles} }`;
const AccountLink = styled(TextButton)`align-self: flex-start; min-height: 44px; padding: 8px 0; font-size: 13px; color: var(--color-text-muted);`;
