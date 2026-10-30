"use client";

import styled from "@emotion/styled";
import { useEffect, useId, useRef, type Ref } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";
import { BaseButton } from "./buttons";
import { ANDROID_BACK_EVENT } from "../navigation/androidBack";

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
  const id = useId(), dialog = useRef<HTMLElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const { onCancel } = props;
  useEffect(() => {
    const previous = document.activeElement;
    const backdrop = dialog.current?.parentElement;
    const siblings = Array.from(backdrop?.parentElement?.children ?? []).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const inert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancel.current?.focus({ preventScroll: true });
    const focusInside = () => { if (cancel.current && !cancel.current.disabled) cancel.current.focus(); else dialog.current?.focus(); };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onCancel(); return; }
      if (event.key !== "Tab") return;
      event.stopImmediatePropagation();
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      if (!controls.length) { event.preventDefault(); dialog.current?.focus(); return; }
      const first = controls[0], last = controls.at(-1)!;
      const outside = !dialog.current?.contains(document.activeElement) || document.activeElement === dialog.current;
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
    };
    const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); onCancel(); };
    const focus = () => { if (!dialog.current?.contains(document.activeElement)) focusInside(); };
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener(ANDROID_BACK_EVENT, back, true);
    document.addEventListener("focusin", focus);
    return () => {
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener(ANDROID_BACK_EVENT, back, true);
      document.removeEventListener("focusin", focus);
      siblings.forEach((node, index) => { node.inert = inert[index]; });
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onCancel]);
  if (typeof document === "undefined") return null;
  const viewport = document.querySelector<HTMLElement>("[data-app-viewport]");
  return createPortal(<Backdrop $contained={Boolean(viewport)} onPointerDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <Dialog ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={props.busy} tabIndex={-1}>
      <TogetherConfirmationContent {...props} idPrefix={id} cancelRef={cancel} />
    </Dialog>
  </Backdrop>, viewport ?? document.body);
}

const Backdrop = styled.div<{ $contained: boolean }>`position: ${({ $contained }) => $contained ? "absolute" : "fixed"}; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: max(20px, var(--app-safe-area-top, 0px)) 20px max(20px, var(--app-safe-area-bottom, 0px)); background: rgb(27 34 42 / .4);`;
const Dialog = styled.section`display: grid; gap: 18px; width: min(100%, 350px); max-height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: 26px 22px 22px; border-radius: 24px; background: var(--color-surface); box-shadow: 0 18px 48px rgb(27 34 42 / .16); outline: none; h2 { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.5; letter-spacing: -.035em; word-break: keep-all; overflow-wrap: anywhere; } p { margin: 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.85; word-break: keep-all; overflow-wrap: anywhere; }`;
const Preserved = styled.div`display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; background: var(--color-brand-100); color: var(--color-text-muted); font-size: 12px; line-height: 1.7; > svg { flex: none; color: var(--color-brand-700); }`;
const Actions = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 10px; > button { min-height: 48px; padding: 10px 8px; border-radius: 14px; font-size: 14px; font-weight: 500; &:disabled { opacity: .55; } }`;
const Cancel = styled(BaseButton)`background: var(--color-secondary-200); color: var(--color-text);`;
const Confirm = styled(BaseButton)`background: #b84242; color: white;`;
const ErrorMessage = styled.div`font-size: 13px; line-height: 1.7; color: #b84242; overflow-wrap: anywhere;`;
