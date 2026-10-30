"use client";
import { confirmAction } from "@/lib/feedback";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { TextButton } from "./buttons";
import { changeTogether } from "@/lib/harumadiTogether";
export function HarumadiSafetyActions({ owner, bookId, targetId, kind, authorId, onBlocked }: {
  owner: string; bookId: string; targetId: string; kind: "comment" | "entry" | "user"; authorId: string; onBlocked: () => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false), [reason, setReason] = useState("inappropriate"), [detail, setDetail] = useState("");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false); const saving = useRef(false);
  if (owner === authorId) return null;
  const perform = async (block: boolean) => {
    if (saving.current) return;
    if (block && !(await confirmAction("차단하면 이 사람과 함께 채우던 모든 책에서 함께 채우기가 종료돼요. 내가 만든 책에서는 상대가 나가고, 다른 책에서는 내가 나가요. 원본 마디와 이미 저장한 PDF는 남아요. 차단할까요?", {"title":"사용자 차단","confirmLabel":"차단하기","tone":"danger"}))) return;
    saving.current = true; setBusy(true); setMessage("");
    try {
      await changeTogether(owner, bookId, block ? "block-user" : "report", block ? authorId : targetId, { kind, reason, detail });
      setOpen(false); setMessage(block ? "차단했어요." : "신고를 접수했어요. 운영자가 확인하겠습니다.");
      if (block) { client.removeQueries({ queryKey: ["harumadi-content", owner] }); client.removeQueries({ queryKey: ["harumadi-comments", owner] }); void client.invalidateQueries({ queryKey: ["library-harumadis", owner] }); onBlocked(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했어요."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Actions><TextButton disabled={busy} onClick={() => setOpen(value => !value)}>신고</TextButton><TextButton disabled={busy} onClick={() => void perform(true)}>차단</TextButton>
    {open && <fieldset><legend>신고 사유</legend><select aria-label="신고 사유" value={reason} onChange={event => setReason(event.target.value)}><option value="inappropriate">부적절한 내용</option><option value="privacy">개인정보 침해</option><option value="copyright">저작권 침해</option><option value="spam">스팸</option><option value="other">기타</option></select><textarea aria-label="신고 설명 (선택)" placeholder="필요한 설명만 남겨주세요. (선택)" maxLength={500} value={detail} onChange={event => setDetail(event.target.value)} /><TextButton disabled={busy} onClick={() => void perform(false)}>신고 보내기</TextButton><TextButton disabled={busy} onClick={() => setOpen(false)}>취소</TextButton></fieldset>}
    {message && <small role="status">{message}</small>}
  </Actions>;
}
const Actions = styled.div`display: flex; flex-wrap: wrap; gap: 4px; align-items: center; > button { font-size: 12px; min-height: 44px; padding: 4px 8px; } fieldset { flex-basis: 100%; margin: 8px 0; padding: 12px; border: 1px solid var(--color-border); border-radius: 10px; } legend { font-size: 13px; } select, textarea { display: block; width: 100%; font: inherit; font-size: 14px; padding: 10px; margin: 8px 0; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); color: inherit; } small { flex-basis: 100%; line-height: 1.7; }`;
