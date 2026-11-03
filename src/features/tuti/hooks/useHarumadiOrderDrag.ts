"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { moveEntry } from "@/shared/harumadi/order";
import { dragOrderScale, dragOrderTarget, dragOrderTop, dragScrollDelta, orderLocalTop, orderFlipOffset, projectOrderSlots, ORDER_MOVE_TIMING, type OrderSlot } from "@/shared/harumadi/dragOrder";

type Drag = { pointerId: number; entryId: string; startY: number; y: number;
  grabOffset: number; height: number; moved: boolean; originalIds: string[]; previewIds: string[]; slots: OrderSlot[] };
type ButtonMotion = { originalIds: string[]; targetIds: string[]; slots: OrderSlot[] };
const motionReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const translation = (y: number) => `translate3d(0,${y}px,0)`;
const transition = () => motionReduced() ? "none" : `transform ${ORDER_MOVE_TIMING.duration}ms ${ORDER_MOVE_TIMING.easing}`;
function setPreviewTransform(node: HTMLElement, y: number, animated = false) {
  node.style.transition = animated ? transition() : "none";
  node.style.transform = translation(y);
}
function clearPreviewTransform(node: HTMLElement) {
  node.style.transition = "none";
  node.style.transform = "";
}

export function useHarumadiOrderDrag({ ids, onChange, disabled, scrollRef }: {
  ids: string[]; onChange: (ids: string[]) => void; disabled: boolean; scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const rowRefs = useRef(new Map<string, (node: HTMLLIElement | null) => void>());
  const animations = useRef(new Map<string, Animation>());
  const before = useRef<Map<string, number> | null>(null);
  const pointer = useRef<Drag | null>(null);
  const buttonMotion = useRef<ButtonMotion | null>(null);
  const buttonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buttonPreview, setButtonPreview] = useState<{ ids: string[]; entryId: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragPreviewIds, setDragPreviewIds] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const capturePositions = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    const scale = dragOrderScale(bounds.height, list.offsetHeight);
    before.current = new Map([...rows.current].map(([id, node]) => [id, orderLocalTop(node.getBoundingClientRect().top, bounds.top, scale)]));
  }, []);
  const freezePositions = useCallback(() => {
    capturePositions();
    for (const [id, row] of rows.current) {
      setPreviewTransform(row, (before.current?.get(id) ?? row.offsetTop) - row.offsetTop);
      animations.current.get(id)?.cancel(); animations.current.delete(id);
    }
    listRef.current?.getBoundingClientRect();
    before.current = null;
  }, [capturePositions]);
  const animate = useCallback((id: string, node: HTMLElement, fromY: number) => {
    animations.current.get(id)?.cancel();
    animations.current.delete(id);
    if (Math.abs(fromY) < .5 || motionReduced() || typeof node.animate !== "function") return;
    const animation = node.animate([{ transform: translation(fromY) }, { transform: translation(0) }], ORDER_MOVE_TIMING);
    animations.current.set(id, animation);
    animation.onfinish = () => { if (animations.current.get(id) === animation) animations.current.delete(id); };
  }, []);
  const positionDragged = useCallback(() => {
    const active = pointer.current, scroller = scrollRef.current, list = listRef.current;
    if (!active || !scroller || !list) return null;
    const node = rows.current.get(active.entryId);
    if (!node) return null;
    const bounds = scroller.getBoundingClientRect(), listBounds = list.getBoundingClientRect();
    const scale = dragOrderScale(listBounds.height, list.offsetHeight);
    const targetTop = dragOrderTop(active.y, active.grabOffset, active.height, bounds.top, bounds.bottom);
    // DOM slots stay fixed throughout the gesture. Only transforms follow the hand.
    const shift = (targetTop - listBounds.top) / scale - node.offsetTop;
    node.style.transform = translation(shift);
    return targetTop + active.height / 2;
  }, [scrollRef]);

  const move = useCallback((id: string, target: number) => {
    if (disabled || pointer.current || target < 0 || target >= ids.length || ids.indexOf(id) === target) return;
    const nextIds = moveEntry(ids, id, target);
    if (motionReduced() || !listRef.current) {
      capturePositions(); onChange(nextIds);
      setAnnouncement(`${target + 1}번째로 옮겼어요.`);
      return;
    }
    let motion = buttonMotion.current;
    if (!motion) {
      const slots = ids.flatMap(id => {
        const row = rows.current.get(id);
        return row ? [{ id, top: row.offsetTop, height: row.offsetHeight }] : [];
      });
      freezePositions();
      motion = { originalIds: [...ids], targetIds: nextIds, slots };
      buttonMotion.current = motion;
    }
    motion.targetIds = nextIds;
    setButtonPreview({ ids: motion.originalIds, entryId: id });
    for (const slot of projectOrderSlots(nextIds, motion.slots)) {
      const row = rows.current.get(slot.id);
      if (row) setPreviewTransform(row, slot.top - row.offsetTop, true);
    }
    // Persistable order updates immediately, but neither DOM node is reinserted
    // until both CSS movements finish. Rapid clicks retarget the same nodes.
    onChange(nextIds);
    if (buttonTimer.current !== null) clearTimeout(buttonTimer.current);
    buttonTimer.current = setTimeout(() => {
      capturePositions();
      buttonMotion.current = null; buttonTimer.current = null;
      setButtonPreview(null);
    }, ORDER_MOVE_TIMING.duration);
    setAnnouncement(`${target + 1}번째로 옮겼어요.`);
  }, [disabled, ids, onChange, capturePositions, freezePositions]);

  // Release commits and completed button previews rebase from current visual
  // positions, including any unfinished neighbour transitions.
  useLayoutEffect(() => {
    if (buttonMotion.current) {
      if (ids.join(",") === buttonMotion.current.targetIds.join(",")) return;
      // An authoritative parent update wins over an unfinished local preview.
      if (buttonTimer.current !== null) clearTimeout(buttonTimer.current);
      buttonTimer.current = null; buttonMotion.current = null;
      queueMicrotask(() => setButtonPreview(null));
    }
    const previous = before.current;
    before.current = null;
    if (pointer.current) {
      if (ids.join(",") === pointer.current.originalIds.join(",")) return;
      const active = pointer.current;
      pointer.current = null;
      const list = listRef.current;
      if (list?.hasPointerCapture(active.pointerId)) list.releasePointerCapture(active.pointerId);
      queueMicrotask(() => { setDragging(null); setDragPreviewIds(null); setAnnouncement("목록이 바뀌어 드래그를 취소했어요."); });
    }
    for (const [id, node] of rows.current) {
      clearPreviewTransform(node);
      const from = previous?.get(id);
      if (from !== undefined) animate(id, node, orderFlipOffset(from, node.offsetTop));
    }
  }, [ids, buttonPreview, animate]);

  const reorderAtPointer = useCallback(() => {
    const active = pointer.current, list = listRef.current;
    if (!active?.moved || !list) return;
    const centerY = positionDragged();
    if (centerY === null) return;
    const bounds = list.getBoundingClientRect(), scale = dragOrderScale(bounds.height, list.offsetHeight);
    const projected = projectOrderSlots(active.previewIds, active.slots);
    const target = dragOrderTarget(projected.map(slot => ({ ...slot, top: bounds.top + slot.top * scale, height: slot.height * scale })), active.entryId, centerY);
    if (target === active.previewIds.indexOf(active.entryId)) return;
    active.previewIds = moveEntry(active.previewIds, active.entryId, target);
    setDragPreviewIds(active.previewIds);
    for (const slot of projectOrderSlots(active.previewIds, active.slots)) {
      if (slot.id === active.entryId) continue;
      const node = rows.current.get(slot.id);
      if (!node) continue;
      setPreviewTransform(node, slot.top - node.offsetTop, true);
    }
    setAnnouncement(`${target + 1}번째 위치예요.`);
  }, [positionDragged]);

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
    if (disabled || !event.isPrimary || event.button !== 0 || pointer.current || buttonMotion.current) return;
    const node = rows.current.get(entryId), list = listRef.current;
    if (!node || !list) return;
    const rect = node.getBoundingClientRect();
    const slots = ids.flatMap(id => {
      const row = rows.current.get(id);
      return row ? [{ id, top: row.offsetTop, height: row.offsetHeight }] : [];
    });
    freezePositions();
    pointer.current = { pointerId: event.pointerId, entryId, startY: event.clientY, y: event.clientY,
      grabOffset: event.clientY - rect.top, height: rect.height, moved: false,
      originalIds: [...ids], previewIds: [...ids], slots };
    list.setPointerCapture(event.pointerId);
    positionDragged();
  };
  const pointerMove = (event: PointerEvent<HTMLOListElement>) => {
    const active = pointer.current;
    if (disabled || !active || active.pointerId !== event.pointerId) return;
    active.y = event.clientY;
    if (!active.moved && Math.abs(active.y - active.startY) < 6) return;
    if (!active.moved) { active.moved = true; setDragging(active.entryId); }
    reorderAtPointer();
  };
  const finish = useCallback((cancel = false, pointerId?: number) => {
    const active = pointer.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    const cancelled = cancel || disabled;
    const changed = !cancelled && active.previewIds.join(",") !== active.originalIds.join(",");
    if (changed) capturePositions();
    pointer.current = null;
    if (changed) {
      // DOM transforms are cleared in the layout effect, before the next paint.
      onChange(active.previewIds);
    } else {
      for (const row of rows.current.values()) {
        setPreviewTransform(row, 0, true);
      }
    }
    setDragging(null);
    setDragPreviewIds(null);
    setAnnouncement(cancelled ? "드래그를 취소했어요." : `${active.previewIds.indexOf(active.entryId) + 1}번째로 옮겼어요.`);
    const list = listRef.current;
    if (list?.hasPointerCapture(active.pointerId)) list.releasePointerCapture(active.pointerId);
  }, [disabled, onChange, capturePositions]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && pointer.current) { event.preventDefault(); finish(true); } };
    const blur = () => finish(true);
    window.addEventListener("keydown", escape); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); };
  }, [finish]);
  useEffect(() => {
    const running = animations.current;
    return () => {
      running.forEach(animation => animation.cancel()); running.clear(); pointer.current = null;
      if (buttonTimer.current !== null) clearTimeout(buttonTimer.current);
      buttonTimer.current = null; buttonMotion.current = null;
    };
  }, []);

  const registerRow = useCallback((id: string) => {
    let callback = rowRefs.current.get(id);
    if (!callback) {
      callback = (node: HTMLLIElement | null) => {
        if (node) rows.current.set(id, node);
        else { rows.current.delete(id); animations.current.get(id)?.cancel(); animations.current.delete(id); }
      };
      rowRefs.current.set(id, callback);
    }
    return callback;
  }, []);
  return { listRef, registerRow, dragging, announcement, move, pointerDown, pointerMove, finish,
    positionIds: dragPreviewIds ?? ids,
    renderIds: buttonPreview?.ids ?? ids, movingId: buttonPreview?.entryId ?? null };
}
