"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { placeSuggestionPosition } from "./placeSuggestionLayout";

export function JournalPlaceSuggestionPopover({ anchor, popup, onDismiss, contentKey, children }: {
  anchor: RefObject<HTMLInputElement | null>; popup: RefObject<HTMLDivElement | null>;
  onDismiss: () => void; contentKey: string; children: React.ReactNode;
}) {
  const [position, setPosition] = useState<ReturnType<typeof placeSuggestionPosition>>(null);
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => { dismiss.current = onDismiss; });
  useLayoutEffect(() => {
    const input = anchor.current;
    if (!input) return;
    const frame = input.closest<HTMLElement>("[data-app-viewport]");
    const viewport = window.visualViewport;
    let pending = 0;
    const measure = () => {
      const visible = { top: viewport?.offsetTop ?? 0, left: viewport?.offsetLeft ?? 0,
        bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
        right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) };
      const next = placeSuggestionPosition(input.getBoundingClientRect(), frame?.getBoundingClientRect() ?? visible, visible, window.innerHeight);
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => {
      window.cancelAnimationFrame(pending);
      pending = window.requestAnimationFrame(measure);
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !input.parentElement?.contains(target) && !popup.current?.contains(target)) dismiss.current();
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(input);
    if (frame) observer?.observe(frame);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.cancelAnimationFrame(pending); observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [anchor, popup]);
  useLayoutEffect(() => {
    // Opening/new results start beside the field, not at the distant general-place group.
    const panel = popup.current;
    panel?.scrollTo({ top: panel.scrollHeight, behavior: "instant" });
  }, [popup, contentKey, position?.maxHeight]);
  if (!position || typeof document === "undefined") return null;
  // Escape the form's clipping/scroll containers; bounds still stay within the PC app mockup.
  return createPortal(<Popover ref={popup} style={position} data-place-suggestion-popover
    onMouseDown={event => event.preventDefault()}>{children}</Popover>, document.body);
}

const Popover = styled.div`
  position: fixed; z-index: 2147481900; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain;
  border: 1px solid var(--color-border); border-radius: var(--ui-field-radius); background: var(--color-surface);
  scrollbar-color: var(--color-border) var(--color-surface);
`;
