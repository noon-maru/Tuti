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
  const touchStart = useRef<Point | null>(null);
  const touchCurrent = useRef<Point | null>(null);
  const scrollTarget = useRef<HTMLElement | null>(null);
  const backTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (backTimeout.current) {
        window.clearTimeout(backTimeout.current);
      }
    };
  }, []);

  const start = (point: Point, target: EventTarget | null) => {
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
    setIsDragging(false);
    setIsCommitting(true);
    setDragY(direction === "up" ? -220 : 220);
    setDragProgress(1);
    clearGestureRefs();

    backTimeout.current = window.setTimeout(onBack, 140);
  };

  const reset = () => {
    setIsDragging(false);
    setIsCommitting(false);
    setDragY(0);
    setDragProgress(0);
    clearGestureRefs();
  };

  const clearGestureRefs = () => {
    pointerStart.current = null;
    touchStart.current = null;
    touchCurrent.current = null;
    scrollTarget.current = null;
  };

  return {
    gestureProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0) {
          return;
        }

        if (start({ x: event.clientX, y: event.clientY }, event.target)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") {
          return;
        }

        update(pointerStart.current, { x: event.clientX, y: event.clientY });
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") {
          return;
        }

        finish(pointerStart.current, { x: event.clientX, y: event.clientY });
      },
      onPointerCancel: reset,
      onTouchStart: (event: TouchEvent<HTMLElement>) => {
        if (event.touches.length !== 1) {
          reset();
          return;
        }

        const touch = event.touches[0];
        start({ x: touch.clientX, y: touch.clientY }, event.target);
      },
      onTouchMove: (event: TouchEvent<HTMLElement>) => {
        if (!touchStart.current || event.touches.length !== 1) {
          return;
        }

        const touch = event.touches[0];
        touchCurrent.current = { x: touch.clientX, y: touch.clientY };

        if (update(touchStart.current, touchCurrent.current)) {
          event.preventDefault();
        }
      },
      onTouchEnd: (event: TouchEvent<HTMLElement>) => {
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
