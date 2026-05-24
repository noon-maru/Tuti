"use client";

import { useEffect, useRef, useState, type PointerEvent, type TouchEvent } from "react";

type Direction = "up" | "down";
type Point = { x: number; y: number };

type SwipeBackOptions = {
  direction: Direction;
  onBack: () => void;
  threshold?: number;
};

export function useVerticalSwipeBack({
  direction,
  onBack,
  threshold = 64,
}: SwipeBackOptions) {
  const [dragY, setDragY] = useState(0);
  const [dragProgress, setDragProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const pointerStart = useRef<Point | null>(null);
  const activePointerId = useRef<number | null>(null);
  const isPointerGesture = useRef(false);
  const touchStart = useRef<Point | null>(null);
  const touchCurrent = useRef<Point | null>(null);
  const scrollTarget = useRef<HTMLElement | null>(null);
  const backTimeout = useRef<number | null>(null);
  const committed = useRef(false);

  useEffect(() => {
    return () => {
      if (backTimeout.current) {
        window.clearTimeout(backTimeout.current);
      }
    };
  }, []);

  const start = (point: Point, target: EventTarget | null) => {
    if (committed.current) {
      return false;
    }

    if (isInteractiveTarget(target)) {
      return false;
    }

    pointerStart.current = point;
    touchStart.current = point;
    touchCurrent.current = point;
    scrollTarget.current =
      target instanceof HTMLElement ? target.closest<HTMLElement>("[data-scroll-region]") : null;
    setIsDragging(true);
    setIsCommitting(false);

    return true;
  };

  const update = (startPoint: Point | null, currentPoint: Point | null) => {
    if (committed.current) {
      return false;
    }

    if (!startPoint || !currentPoint) {
      return false;
    }

    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    const nextDragY = getActionDragY({
      dx,
      dy,
      direction,
      scrollElement: scrollTarget.current,
    });

    setDragY(nextDragY);
    setDragProgress(Math.min(Math.abs(nextDragY) / 160, 1));

    return nextDragY !== 0;
  };

  const finish = (startPoint: Point | null, endPoint: Point | null) => {
    if (committed.current) {
      return;
    }

    if (!startPoint || !endPoint) {
      reset();
      return;
    }

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;

    if (shouldGoBack({ dx, dy, direction, threshold, scrollElement: scrollTarget.current })) {
      commitBack();
      return;
    }

    reset();
  };

  const commitBack = () => {
    committed.current = true;
    setIsDragging(false);
    setIsCommitting(true);
    setDragY(getExitY(direction));
    setDragProgress(1);
    clearGestureRefs();

    backTimeout.current = window.setTimeout(onBack, 180);
  };

  const reset = () => {
    if (committed.current) {
      return;
    }

    setIsDragging(false);
    setIsCommitting(false);
    setDragY(0);
    setDragProgress(0);
    clearGestureRefs();
  };

  const clearGestureRefs = () => {
    pointerStart.current = null;
    activePointerId.current = null;
    isPointerGesture.current = false;
    touchStart.current = null;
    touchCurrent.current = null;
    scrollTarget.current = null;
  };

  return {
    gestureProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === "touch") {
          return;
        }

        if (start({ x: event.clientX, y: event.clientY }, event.target)) {
          activePointerId.current = event.pointerId;
          isPointerGesture.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (activePointerId.current !== event.pointerId) {
          return;
        }

        update(pointerStart.current, { x: event.clientX, y: event.clientY });
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (activePointerId.current !== event.pointerId) {
          return;
        }

        finish(pointerStart.current, { x: event.clientX, y: event.clientY });
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        if (activePointerId.current !== event.pointerId) {
          return;
        }

        reset();
      },
      onTouchStart: (event: TouchEvent<HTMLElement>) => {
        if (isPointerGesture.current) {
          return;
        }

        if (event.touches.length !== 1) {
          reset();
          return;
        }

        const touch = event.touches[0];
        start({ x: touch.clientX, y: touch.clientY }, event.target);
      },
      onTouchMove: (event: TouchEvent<HTMLElement>) => {
        if (isPointerGesture.current) {
          return;
        }

        if (!touchStart.current || event.touches.length !== 1) {
          return;
        }

        const touch = event.touches[0];
        touchCurrent.current = { x: touch.clientX, y: touch.clientY };

        if (update(touchStart.current, touchCurrent.current) && event.cancelable) {
          event.preventDefault();
        }
      },
      onTouchEnd: (event: TouchEvent<HTMLElement>) => {
        if (isPointerGesture.current) {
          return;
        }

        const touch = event.changedTouches[0];
        const endPoint = touch ? { x: touch.clientX, y: touch.clientY } : touchCurrent.current;
        finish(touchStart.current, endPoint);
      },
      onTouchCancel: reset,
    },
    dragY,
    dragProgress,
    isDragging,
    isCommitting,
  };
}

function getExitY(direction: Direction) {
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const distance = Math.max(viewportHeight, 520);

  return direction === "up" ? -distance : distance;
}

function getActionDragY({
  dx,
  dy,
  direction,
  scrollElement,
}: {
  dx: number;
  dy: number;
  direction: Direction;
  scrollElement: HTMLElement | null;
}) {
  const isMostlyVertical = Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx) * 1.1;
  const matchesDirection = direction === "up" ? dy < 0 : dy > 0;

  if (
    !isMostlyVertical ||
    !matchesDirection ||
    canScrollInDirection(scrollElement, direction)
  ) {
    return 0;
  }

  return dy;
}

function shouldGoBack({
  dx,
  dy,
  direction,
  threshold,
  scrollElement,
}: {
  dx: number;
  dy: number;
  direction: Direction;
  threshold: number;
  scrollElement: HTMLElement | null;
}) {
  const isVertical = Math.abs(dy) > threshold && Math.abs(dy) > Math.abs(dx) * 1.25;
  const matchesDirection = direction === "up" ? dy < 0 : dy > 0;

  if (!isVertical || !matchesDirection) {
    return false;
  }

  return !canScrollInDirection(scrollElement, direction);
}

function canScrollInDirection(element: HTMLElement | null, direction: Direction) {
  if (!element) {
    return false;
  }

  if (direction === "up") {
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }

  return element.scrollTop > 0;
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, a, input, textarea, select, [data-swipe-back-ignore]"))
  );
}
