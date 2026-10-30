"use client";

import styled from "@emotion/styled";
import { useId, useRef, type Ref } from "react";
import { ShieldCheck } from "lucide-react";
import { BaseButton } from "./buttons";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";

export type TogetherConfirmationAction = "end-together" | "remove-member" | "leave" | "remove-entry";
const copy = {
  "end-together": { title: "함께 채우기를 종료할까요?", description: "모든 초대가 취소되고 참여자의 책장에서 이 하루마디가 사라져요. 다른 사람이 담은 마디와 공유 댓글 본문을 정리하고, 나만의 하루마디로 돌아가요.", confirm: "종료하기" },
  "remove-member": { title: "이 사람을 내보낼까요?", description: "상대의 책장에서 이 하루마디가 사라지고, 상대가 담은 마디와 댓글은 이 책에서 빠져요.", confirm: "내보내기" },
  leave: { title: "함께 채우기에서 나갈까요?", description: "내 책장에서 이 하루마디가 사라지고, 내가 담은 마디와 댓글은 이 책에서 빠져요.", confirm: "나가기" },
  "remove-entry": { title: "이 책에서 마디를 뺄까요?", description: "이 하루마디에서만 마디를 빼요. 다른 하루마디에 담긴 마디는 바뀌지 않아요.", confirm: "책에서 빼기" },
} satisfies Record<TogetherConfirmationAction, { title: string; description: string; confirm: string }>;
type Props = { action: TogetherConfirmationAction; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void };

export function TogetherConfirmationContent({ action, busy, error, onCancel, onConfirm, idPrefix, cancelRef }: Props & { idPrefix: string; cancelRef?: Ref<HTMLButtonElement> }) {
  const content = copy[action];
  return <>
    <h2 id={`${idPrefix}-title`}>{content.title}</h2>
    <p id={`${idPrefix}-description`}>{content.description}</p>
    <Preserved><ShieldCheck size={18} aria-hidden="true" /><span>각자의 원본 마디와<br />이미 저장한 PDF는 그대로 남아요.</span></Preserved>
    {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    <Actions>
      <Cancel ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>취소</Cancel>
      <Confirm type="button" disabled={busy} onClick={onConfirm}>{busy ? "처리하고 있어요…" : content.confirm}</Confirm>
    </Actions>
  </>;
}

export function HarumadiTogetherConfirmDialog(props: Props) {
  const id = useId(), cancel = useRef<HTMLButtonElement>(null);
  return <AppDialogFrame titleId={`${id}-title`} descriptionId={`${id}-description`} busy={props.busy} initialFocus={cancel} onCancel={props.onCancel}>
    <TogetherConfirmationContent {...props} idPrefix={id} cancelRef={cancel} />
  </AppDialogFrame>;
}

const Preserved = styled.div`display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; background: var(--color-brand-100); color: var(--color-text-muted); font-size: 12px; line-height: 1.7; > svg { flex: none; color: var(--color-brand-700); }`;
const Actions = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 10px; > button { min-height: 48px; padding: 10px 8px; border-radius: 14px; font-size: 14px; font-weight: 500; &:disabled { opacity: .55; } }`;
const Cancel = styled(BaseButton)`background: var(--color-secondary-200); color: var(--color-text);`;
const Confirm = styled(BaseButton)`background: #b84242; color: white;`;
const ErrorMessage = styled.div`font-size: 13px; line-height: 1.7; color: #b84242; overflow-wrap: anywhere;`;
