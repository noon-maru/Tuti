"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { TextButton } from "./buttons";
import { changeTogether, fetchTogether, shareHarumadiInvite } from "@/lib/harumadiTogether";
import { HarumadiSafetyActions } from "./HarumadiSafetyActions";
import { HarumadiTogetherConfirmDialog, type TogetherConfirmationAction } from "./HarumadiTogetherConfirmDialog";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { HarumadiNotificationToggle } from "./HarumadiNotificationToggle";
import { HarumadiTogetherView } from "./HarumadiTogetherView";
import { harumadiParticipantIdentity } from "@/shared/harumadi/participant";
import { captionStyles } from "@/shared/ui/typography";
import { loginPath } from "@/lib/loginContinuation";
import { getSessionSnapshot } from "@/lib/auth/session";
import type { HarumadiPeriod } from "@/shared/harumadi/period";
import type { HarumadiList } from "@/shared/api/harumadi";
import type { HarumadiTogether } from "@/shared/api/harumadiTogether";
export function HarumadiTogetherPanel({ owner, bookId, bookTitle, period, onKeep, onExit, entries = [] }: { owner: string; bookId: string; bookTitle?: string; period?: HarumadiPeriod; onKeep?: () => void; onExit: () => void; entries?: TutiJournalEntry[] }) {
  const client = useQueryClient(), router = useRouter();
  const query = useQuery({ queryKey: ["harumadi-together", owner, bookId], queryFn: () => fetchTogether(owner, bookId), retry: false });
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [pendingInvite, setPendingInvite] = useState<{ id: string; token: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ action: TogetherConfirmationAction; target?: string } | null>(null);
  const [removedEntries, setRemovedEntries] = useState<{ source: typeof entries; ids: ReadonlySet<string> } | null>(null);
  const pendingRemoval = removedEntries?.source === entries ? removedEntries.ids : null;
  const visibleEntries = pendingRemoval ? entries.filter(entry => !pendingRemoval.has(entry.id)) : entries;
  const inFlight = useRef(false);
  const closeConfirmation = useCallback(() => { if (!inFlight.current) setConfirmation(null); }, []);
  const requestConfirmation = (type: TogetherConfirmationAction, target?: string) => {
    if (inFlight.current) return;
    setNotice(""); setConfirmation({ action: type, target });
  };
  const refresh = () => {
    client.removeQueries({ queryKey: ["library-cover", owner] });
    void client.invalidateQueries({ queryKey: ["harumadi-together", owner, bookId] });
    void client.invalidateQueries({ queryKey: ["library-harumadis", owner] });
    void client.invalidateQueries({ queryKey: ["harumadi-content", owner, bookId] });
  };
  const action = async (type: string, target?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setNotice("");
    try {
      if (type === "invite") {
        const invite = pendingInvite ?? await changeTogether<{ id: string; token: string }>(owner, bookId, "invite", undefined, { sharingConfirmed: true });
        setPendingInvite(invite);
        refresh();
        const result = await shareHarumadiInvite(invite.token, { title: bookTitle, ...period });
        if (result !== "cancelled") setPendingInvite(null);
        setNotice(result === "copied" ? "초대 링크를 복사했어요." : result === "cancelled" ? "공유를 취소했어요. 아래에서 초대도 취소할 수 있어요." : "수락하면 상대방 책장에도 같은 하루마디가 보여요.");
      } else {
        await changeTogether(owner, bookId, type, target);
        if (getSessionSnapshot()?.userId !== owner) return;
        setConfirmation(null);
        if (type === "revoke-invite" && target === pendingInvite?.id) setPendingInvite(null);
        if (type === "leave" || type === "end-together") {
          setPendingInvite(null);
          client.removeQueries({ queryKey: ["harumadi-content", owner, bookId] });
          client.removeQueries({ queryKey: ["harumadi-comments", owner, bookId] });
          client.removeQueries({ queryKey: ["harumadi-together", owner, bookId] });
          client.removeQueries({ queryKey: ["library-cover", owner, bookId] });
          if (type === "leave") {
            const key = ["library-harumadis", owner, "all"];
            void client.cancelQueries({ queryKey: key });
            client.setQueryData<{ pages: HarumadiList[] }>(key, previous =>
              previous && { ...previous, pages: previous.pages.map(page => ({ ...page, harumadis: page.harumadis.filter(book => book.id !== bookId) })) });
          }
          void client.invalidateQueries({ queryKey: ["library-harumadis", owner] });
          onExit(); return;
        }
        if (type === "revoke-invite" || type === "remove-member") {
          const key = ["harumadi-together", owner, bookId];
          void client.cancelQueries({ queryKey: key });
          client.setQueryData<HarumadiTogether>(key, previous => previous && (type === "revoke-invite"
            ? { ...previous, invites: previous.invites.filter(invite => invite.id !== target) }
            : { ...previous, participants: previous.participants.filter(person => person.userId !== target) }));
        }
        if (type === "remove-entry" || type === "remove-member") {
          const removed = visibleEntries.filter(entry => type === "remove-entry" ? entry.id === target : entry.authorId === target);
          setRemovedEntries({ source: entries, ids: new Set([...(pendingRemoval ?? []), ...removed.map(entry => entry.id)]) });
          if (type === "remove-member") client.removeQueries({ queryKey: ["harumadi-comments", owner, bookId] });
        }
        setNotice(type === "revoke-invite" ? "초대를 취소했어요." : type === "remove-entry" ? "이 책에서 마디를 뺐어요." : type === "remove-member" ? "참여자를 내보냈어요." : "요청을 완료했어요.");
        refresh();
      }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "요청을 완료하지 못했어요. 다시 시도해주세요."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const management = query.data && <>
    <List aria-label="참여자 신고 관리">{query.data.participants.filter(person => person.userId !== owner).map(person => <li key={person.userId}><span>{harumadiParticipantIdentity(person, owner).name}</span><HarumadiSafetyActions owner={owner} bookId={bookId} targetId={person.userId} authorId={person.userId} kind="user" onBlocked={onExit} /></li>)}</List>
    <List aria-label="담긴 마디 관리">{visibleEntries.map(entry => <li key={entry.id}><span>{entry.title || entry.placeName || "남긴 마디"}<small>{entry.authorId === owner ? "내가 남긴 마디" : "함께 채운 마디"}</small></span>{(query.data.owner || entry.authorId === owner) && <TextButton disabled={busy} onClick={() => requestConfirmation("remove-entry", entry.id)}>책에서 빼기</TextButton>}{entry.authorId && <HarumadiSafetyActions owner={owner} bookId={bookId} targetId={entry.id} authorId={entry.authorId} kind="entry" onBlocked={onExit} />}</li>)}</List>
    {visibleEntries.length === 0 && <EmptyManagement>아직 이 하루마디에 담긴 마디가 없어요.</EmptyManagement>}
  </>;
  return <>
    <HarumadiTogetherView viewerId={owner} bookTitle={bookTitle} period={period} onKeep={visibleEntries.length ? onKeep : undefined} data={query.data} loading={query.isPending} error={query.isError && !query.data ? query.error.message : undefined}
      busy={busy} notice={busy && !confirmation && !notice ? "요청을 처리하고 있어요…" : notice} reuseInvite={Boolean(pendingInvite)}
      onInvite={() => void action("invite")} onRevoke={id => void action("revoke-invite", id)} onConfirm={requestConfirmation}
      onRetry={() => void query.refetch()} onAccount={() => router.push(loginPath(`/harumadi?harumadiId=${encodeURIComponent(bookId)}&mode=together`))}
      notification={<HarumadiNotificationToggle owner={owner} bookId={bookId} disabled={busy} />} management={management} />
    {confirmation && <HarumadiTogetherConfirmDialog action={confirmation.action} busy={busy} error={notice || undefined} onCancel={closeConfirmation} onConfirm={() => void action(confirmation.action, confirmation.target)} />}
  </>;
}
const List = styled.ul`margin: 0; padding: 0; list-style: none; li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; padding: 14px 0; } li > span { min-width: 0; overflow-wrap: anywhere; font-size: 14px; line-height: 1.6; } li > div { grid-column: 1 / -1; } small { ${captionStyles} display: block; margin-top: 4px; } button { min-height: 44px; flex-shrink: 0; }`;
const EmptyManagement = styled.p`${captionStyles} margin: 0 0 16px;`;
