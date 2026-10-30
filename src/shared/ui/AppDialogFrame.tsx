"use client";

import styled from "@emotion/styled";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";

export function AppDialogFrame({ children, titleId, descriptionId, busy = false, initialFocus, onCancel }: {
  children: ReactNode; titleId: string; descriptionId: string; busy?: boolean;
  initialFocus: RefObject<HTMLButtonElement | null>; onCancel: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const backdrop = dialog.current?.parentElement;
    const siblings = Array.from(backdrop?.parentElement?.children ?? []).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const inert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    initialFocus.current?.focus({ preventScroll: true });
    const focusInside = () => { if (initialFocus.current && !initialFocus.current.disabled) initialFocus.current.focus(); else dialog.current?.focus(); };
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
  }, [onCancel, initialFocus]);
  if (typeof document === "undefined") return null;
  const viewport = document.querySelector<HTMLElement>("[data-app-viewport]");
  return createPortal(<Backdrop $contained={Boolean(viewport)} onPointerDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <Dialog ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} tabIndex={-1}>{children}</Dialog>
  </Backdrop>, viewport ?? document.body);
}

const Backdrop = styled.div<{ $contained: boolean }>`position: ${({ $contained }) => $contained ? "absolute" : "fixed"}; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: max(20px, var(--app-safe-area-top, 0px)) 20px max(20px, var(--app-safe-area-bottom, 0px)); background: rgb(27 34 42 / .4);`;
const Dialog = styled.section`display: grid; gap: 18px; width: min(100%, 350px); max-height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: 26px 22px 22px; border-radius: 24px; background: var(--color-surface); box-shadow: 0 18px 48px rgb(27 34 42 / .16); outline: none; h2 { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.5; letter-spacing: -.035em; word-break: keep-all; overflow-wrap: anywhere; } p { margin: 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.85; white-space: pre-line; word-break: keep-all; overflow-wrap: anywhere; }`;
