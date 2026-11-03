"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { moveEntry } from "@/shared/harumadi/order";
import { dragOrderScale, dragOrderTarget, dragOrderTop, dragScrollDelta } from "@/shared/harumadi/dragOrder";

type Drag = { pointerId: number; entryId: string; startY: number; x: number; y: number;
  grabOffset: number; height: number; moved: boolean; originalIds: string[] };
const motionReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const timing = { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" };

export function useHarumadiOrderDrag({ ids, onChange, disabled, scrollRef }: {
  ids: string[]; onChange: (ids: string[]) => void; disabled: boolean; scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const rowRefs = useRef(new Map<string, (node: HTMLLIElement | null) => void>());
  const animations = useRef(new Map<string, Animation>());
  const shifts = useRef(new Map<string, number>());
  const before = useRef<Map<string, number> | null>(null);
  const pointer = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const capturePositions = useCallback(() => {
    before.current = new Map([...rows.current].map(([id, node]) => [id, node.getBoundingClientRect().top]));
  }, []);
  const animate = useCallback((id: string, node: HTMLElement, fromY: number) => {
    animations.current.get(id)?.cancel();
    animations.current.delete(id);
    if (Math.abs(fromY) < .5 || motionReduced() || typeof node.animate !== "function") return;
    const animation = node.animate([
      { transform: `translate3d(0,${fromY}px,0)` }, { transform: "translate3d(0,0,0)" },
    ], timing);
    animations.current.set(id, animation);
    animation.onfinish = () => { if (animations.current.get(id) === animation) animations.current.delete(id); };
  }, []);
  const positionDragged = useCallback(() => {
    const active = pointer.current, scroller = scrollRef.current;
    if (!active || !scroller) return null;
    const node = rows.current.get(active.entryId);
    if (!node) return null;
    const bounds = scroller.getBoundingClientRect();
    const targetTop = dragOrderTop(active.y, active.grabOffset, active.height, bounds.top, bounds.bottom);
    const list = listRef.current;
    const scale = list ? dragOrderScale(list.getBoundingClientRect().height, list.offsetHeight) : 1;
    const layoutTop = node.getBoundingClientRect().top - (shifts.current.get(active.entryId) ?? 0) * scale;
    const shift = (targetTop - layoutTop) / scale;
    shifts.current.set(active.entryId, shift);
    node.style.transform = `translate3d(0,${shift}px,0)`;
    return targetTop + active.height / 2;
  }, [scrollRef]);
  const move = useCallback((id: string, target: number) => {
    if (disabled || target < 0 || target >= ids.length || ids.indexOf(id) === target) return;
    capturePositions();
    onChange(moveEntry(ids, id, target));
    setAnnouncement(`${target + 1}번째로 옮겼어요.`);
  }, [disabled, ids, onChange, capturePositions]);

  // DOM 순서가 바뀌기 전 위치에서 새 위치까지 이동시킨다. 잡은 행은 포인터 위치를 유지한다.
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    const list = listRef.current;
    const scale = list ? dragOrderScale(list.getBoundingClientRect().height, list.offsetHeight) : 1;
    for (const [id, node] of rows.current) {
      if (id === pointer.current?.entryId) continue;
      const from = previous?.get(id);
      if (from === undefined) continue;
      animations.current.get(id)?.cancel();
      animate(id, node, (from - node.getBoundingClientRect().top) / scale);
    }
    positionDragged();
  }, [ids, animate, positionDragged]);

  const reorderAtPointer = useCallback(() => {
    const active = pointer.current, list = listRef.current;
    if (!active?.moved || !list) return;
    const centerY = positionDragged();
    if (centerY === null) return;
    const bounds = list.getBoundingClientRect();
    const scale = dragOrderScale(bounds.height, list.offsetHeight);
    const slots = ids.flatMap(id => {
      const node = rows.current.get(id);
      return node ? [{ id, top: bounds.top + node.offsetTop * scale, height: node.offsetHeight * scale }] : [];
    });
    move(active.entryId, dragOrderTarget(slots, active.entryId, centerY));
  }, [ids, move, positionDragged]);

  useEffect(() => {
    if (!dragging || disabled) return;
    let frame = 0;
    const tick = () => {
      const active = pointer.current, scroller = scrollRef.current;
      if (!active || !scroller) return;
      const bounds = scroller.getBoundingClientRect();
      const delta = dragScrollDelta(active.y, bounds.top, bounds.bottom);
      if (delta) scroller.scrollBy({ top: delta });
      reorderAtPointer();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging, disabled, scrollRef, reorderAtPointer]);

  const pointerDown = (event: PointerEvent<HTMLButtonElement>, entryId: string) => {
    if (disabled || !event.isPrimary || event.button !== 0 || pointer.current) return;
    const node = rows.current.get(entryId), list = listRef.current;
    if (!node || !list) return;
    const rect = node.getBoundingClientRect();
    animations.current.get(entryId)?.cancel();
    animations.current.delete(entryId);
    pointer.current = { pointerId: event.pointerId, entryId, startY: event.clientY,
      x: event.clientX, y: event.clientY, grabOffset: event.clientY - rect.top, height: rect.height,
      moved: false, originalIds: [...ids] };
    // 캡처를 움직이는 행이 아닌 고정 목록에 둬 DOM 재배치 중에도 드래그가 끊기지 않는다.
    list.setPointerCapture(event.pointerId);
    positionDragged();
  };
  const pointerMove = (event: PointerEvent<HTMLOListElement>) => {
    const active = pointer.current;
    if (disabled || !active || active.pointerId !== event.pointerId) return;
    active.x = event.clientX; active.y = event.clientY;
    if (!active.moved && Math.abs(active.y - active.startY) < 6) return;
    active.moved = true;
    setDragging(active.entryId);
    reorderAtPointer();
  };
  const finish = useCallback((cancel = false, pointerId?: number) => {
    const active = pointer.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    const node = rows.current.get(active.entryId);
    const restore = cancel && ids.join(",") !== active.originalIds.join(",");
    if (restore) capturePositions();
    pointer.current = null;
    const shift = shifts.current.get(active.entryId) ?? 0;
    shifts.current.delete(active.entryId);
    if (node) {
      node.style.transform = "";
      if (!restore) animate(active.entryId, node, shift);
    }
    if (restore) onChange(active.originalIds);
    setDragging(null);
    if (cancel) setAnnouncement("드래그를 취소했어요.");
    const list = listRef.current;
    if (list?.hasPointerCapture(active.pointerId)) list.releasePointerCapture(active.pointerId);
  }, [ids, onChange, animate, capturePositions]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && pointer.current) { event.preventDefault(); finish(true); } };
    window.addEventListener("keydown", escape);
    const blur = () => finish(true);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); };
  }, [finish]);
  useEffect(() => {
    const running = animations.current;
    return () => { running.forEach(animation => animation.cancel()); running.clear(); pointer.current = null; };
  }, []);

  const registerRow = useCallback((id: string) => {
    let callback = rowRefs.current.get(id);
    if (!callback) {
      callback = (node: HTMLLIElement | null) => {
        if (node) rows.current.set(id, node);
        else { rows.current.delete(id); shifts.current.delete(id); animations.current.get(id)?.cancel(); animations.current.delete(id); }
      };
      rowRefs.current.set(id, callback);
    }
    return callback;
  }, []);
  return { listRef, registerRow, dragging, announcement, move, pointerDown, pointerMove, finish };
}
