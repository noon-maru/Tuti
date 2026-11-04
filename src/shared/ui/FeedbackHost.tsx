"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { CircleAlert, X } from "lucide-react";
import { feedback, type FeedbackSnapshot } from "@/lib/feedback";
import { getSessionSnapshot, subscribeToSession } from "@/lib/auth/session";
import { AppDialogFrame } from "./AppDialogFrame";
import { BaseButton } from "./buttons";
import { ToastSurface, ToastDismiss } from "./ToastSurface";

export function FeedbackHost() {
  const state = useSyncExternalStore(feedback.subscribe, feedback.getSnapshot, feedback.getServerSnapshot);
  const pathname = usePathname(), search = useSearchParams().toString();
  useEffect(() => {
    const detach = feedback.attach(() => JSON.stringify([window.location.pathname, window.location.search, getSessionSnapshot()?.userId ?? null]));
    let owner = getSessionSnapshot()?.userId;
    const unsubscribe = subscribeToSession(() => { const next = getSessionSnapshot()?.userId; if (next !== owner) { owner = next; feedback.reset(); } });
    const cancel = () => feedback.cancelConfirmation();
    window.addEventListener("popstate", cancel);
    window.addEventListener("tuti:service-terms-required", cancel);
    return () => { window.removeEventListener("popstate", cancel); window.removeEventListener("tuti:service-terms-required", cancel); unsubscribe(); detach(); };
  }, []);
  useEffect(() => { feedback.cancelConfirmation(); }, [pathname, search]);
  return <>
    {state.confirmation && <Confirmation key={state.confirmation.id} request={state.confirmation} />}
    {state.toast && <Toast key={state.toast.id} notice={state.toast} />}
  </>;
}

function Confirmation({ request }: { request: NonNullable<FeedbackSnapshot["confirmation"]> }) {
  const id = useId(), cancel = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => feedback.answer(request.id, false), [request.id]);
  return <AppDialogFrame titleId={`${id}-title`} descriptionId={`${id}-description`} initialFocus={cancel} onCancel={close}>
    <h2 id={`${id}-title`}>{request.title ?? "계속할까요?"}</h2>
    <p id={`${id}-description`}>{request.message}</p>
    <Actions><Cancel ref={cancel} type="button" onClick={close}>취소</Cancel><Accept $danger={request.tone === "danger"} type="button" onClick={() => feedback.answer(request.id, true)}>{request.confirmLabel ?? "계속하기"}</Accept></Actions>
  </AppDialogFrame>;
}

function Toast({ notice }: { notice: NonNullable<FeedbackSnapshot["toast"]> }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (paused) return; const timer = window.setTimeout(() => feedback.dismissToast(notice.id), notice.tone === "error" ? 10000 : 6000); return () => window.clearTimeout(timer); }, [notice.id, notice.tone, paused]);
  if (typeof document === "undefined") return null;
  const viewport = document.querySelector<HTMLElement>("[data-app-viewport]");
  return createPortal(<ToastArea $contained={Boolean(viewport)}>
    <ToastCard onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {notice.tone === "error" && <CircleAlert size={18} color="var(--color-error)" aria-hidden="true" />}
      <span role={notice.tone === "error" ? "alert" : "status"} aria-atomic="true">{notice.message}</span>
      <ToastDismiss type="button" aria-label="알림 닫기" onClick={() => feedback.dismissToast(notice.id)}><X size={18} aria-hidden="true" /></ToastDismiss>
    </ToastCard>
  </ToastArea>, viewport ?? document.body);
}
const Actions = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 10px; > button { min-height: 48px; padding: 10px; border-radius: 14px; font-size: 14px; font-weight: 500; }`;
const Cancel = styled(BaseButton)`background: var(--color-secondary-200); color: var(--color-text);`;
const Accept = styled(BaseButton)<{ $danger: boolean }>`background: ${({ $danger }) => $danger ? "#b84242" : "var(--color-brand-500)"}; color: ${({ $danger }) => $danger ? "white" : "var(--color-text)"};`;
const ToastArea = styled.div<{ $contained: boolean }>`position: ${({ $contained }) => $contained ? "absolute" : "fixed"}; z-index: 2147483100; bottom: calc(88px + var(--app-safe-area-bottom, 0px)); left: 16px; right: 16px; display: flex; justify-content: center; pointer-events: none;`;
const ToastCard = styled(ToastSurface)`> span { max-height: min(180px, 25dvh); overflow-y: auto; }`;
