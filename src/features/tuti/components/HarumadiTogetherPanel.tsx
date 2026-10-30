"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { Users, UserPlus } from "lucide-react";
import { BaseButton, PrimaryButton, TextButton } from "./buttons";
import { changeTogether, fetchTogether, shareHarumadiInvite } from "@/lib/harumadiTogether";
import { HarumadiSafetyActions } from "./HarumadiSafetyActions";
import { HarumadiTogetherConfirmDialog, type TogetherConfirmationAction } from "./HarumadiTogetherConfirmDialog";
import type { TutiJournalEntry } from "@/shared/api/journal";
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
    <Users size={28} strokeWidth={1.3} /><h1 id="together-title">함께 채우기</h1><p>각자의 순간을<br />하나의 하루마디에 담아보세요.</p>
    <Disclosure>이 책에 담긴 마디는 현재·앞으로 참여하는 사람들에게 보여요. 다른 하루마디와 개인 마디 목록은 공유되지 않아요. 참여자는 PDF 사본을 저장할 수 있어요.</Disclosure>
    {query.isPending ? <p role="status">함께할 사람을 확인하고 있어요.</p> : query.isError ? <p role="alert">{query.error.message}<TextButton onClick={() => void query.refetch()}>다시 확인하기</TextButton></p> : <>
      <List aria-label="함께 채우는 사람">{query.data.participants.map(person => <li key={person.userId}><Avatar aria-hidden="true">{person.name.slice(0, 1)}</Avatar><span>{person.name}<small>{person.owner ? "만든 사람" : "함께 채우는 사람"}</small></span>{query.data.owner && !person.owner && <TextButton disabled={busy} onClick={() => requestConfirmation("remove-member", person.userId)}>내보내기</TextButton>}</li>)}</List>
      {query.data.owner ? <><PrimaryButton disabled={busy} onClick={() => void action("invite")}><UserPlus size={18} />초대 링크 보내기</PrimaryButton><small>한 링크로 한 명이 참여해요. 여러 명에게는 각각 보내주세요. 7일 동안 유효하며 전달받은 사람도 수락할 수 있어요.</small>
        {query.data.invites.length > 0 && <List aria-label="수락 대기 중인 초대">{query.data.invites.map((invite, index) => <li key={invite.id}><span>수락 대기 중인 초대 {index + 1}<small>{new Date(invite.expiresAt).toLocaleDateString("ko-KR")} 만료</small></span><TextButton disabled={busy} onClick={() => void action("revoke-invite", invite.id)}>취소</TextButton></li>)}</List>}</>
        : <Danger disabled={busy} onClick={() => requestConfirmation("leave")}>함께 채우기 나가기</Danger>}
      {query.data.owner && query.data.shared && <EndSection><Danger disabled={busy} onClick={() => requestConfirmation("end-together")}>함께 채우기 종료</Danger><small>초대와 참여를 모두 해제하고 나만의 하루마디로 돌아가요.<br />각자의 원본 마디와 저장한 PDF는 남아요.</small></EndSection>}
    </>}
    {notice && <p role="status">{notice}</p>}
    {query.data && <details><summary>담긴 마디·참여자 관리</summary><List>{query.data.participants.filter(person => person.userId !== owner).map(person => <li key={person.userId}><span>{person.name}</span><HarumadiSafetyActions owner={owner} bookId={bookId} targetId={person.userId} authorId={person.userId} kind="user" onBlocked={onExit} /></li>)}</List><List>{entries.map(entry => <li key={entry.id}><span>{entry.title || entry.placeName || "남긴 마디"}<small>{entry.authorId === owner ? "내가 남긴 마디" : "함께 채운 마디"}</small></span>{(query.data.owner || entry.authorId === owner) && <TextButton disabled={busy} onClick={() => requestConfirmation("remove-entry", entry.id)}>책에서 빼기</TextButton>}{entry.authorId && <HarumadiSafetyActions owner={owner} bookId={bookId} targetId={entry.id} authorId={entry.authorId} kind="entry" onBlocked={onExit} />}</li>)}</List></details>}
    <TextButton disabled={busy} onClick={() => router.push("/login")}>로그인 계정 확인</TextButton>
    {confirmation && <HarumadiTogetherConfirmDialog action={confirmation.action} busy={busy} error={notice || undefined} onCancel={closeConfirmation} onConfirm={() => void action(confirmation.action, confirmation.target)} />}
  </Panel>;
}
const Panel = styled.section`display: flex; flex-direction: column; gap: 18px; padding: 8px 0 24px; h1 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -.04em; } p { margin: 0; line-height: 1.8; font-size: 15px; } > small { font-size: 12px; line-height: 1.8; color: var(--color-text-muted); }`;
const Disclosure = styled.div`font-size: 12px; line-height: 1.9; padding: 16px; border-radius: 12px; background: var(--color-brand-100); color: var(--color-text-muted);`;
const List = styled.ul`margin: 0; padding: 0; list-style: none; li { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--color-border); } li > span { flex: 1; overflow-wrap: anywhere; font-size: 15px; } small { display: block; margin-top: 5px; font-size: 12px; color: var(--color-text-muted); } button { min-height: 44px; flex-shrink: 0; }`;
const Avatar = styled.div`display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; font-size: 14px; background: var(--color-brand-100);`;
const Danger = styled(BaseButton)`padding: 14px; margin-top: 12px; color: var(--color-danger, #b84242); border: 1px solid var(--color-border); border-radius: 12px; background: transparent;`;
const EndSection = styled.div`display: grid; gap: 10px; margin-top: 12px; padding-top: 16px; border-top: 1px solid var(--color-border); > small { color: var(--color-text-muted); font-size: 12px; line-height: 1.8; }`;
