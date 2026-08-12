"use client";

import styled from "@emotion/styled";
import { MapPinCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BaseButton,
  PrimaryButton,
  TextButton,
} from "@/features/tuti/components/buttons";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";

const TRANSITION_DURATION = 380;
const DISMISS_THRESHOLD = 72;

export function DepartureReturnSheet({
  placeName,
  onVisited,
  onNotYet,
  onLater,
}: {
  placeName: string;
  onVisited: () => void;
  onNotYet: () => void;
  onLater: () => void;
}) {
  const animationReady = useDeferredAnimationStart();
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const closingRef = useRef(false);

  const closeWith = useCallback((callback: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(callback, TRANSITION_DURATION);
  }, []);

  useEffect(() => {
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWith(onNotYet);
    };
    window.addEventListener("keydown", closeFromEscape);
    return () => window.removeEventListener("keydown", closeFromEscape);
  }, [closeWith, onNotYet]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (closing || !event.isPrimary || event.button !== 0) return;
    dragStartY.current = event.clientY;
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }
    const distance = event.clientY - dragStartY.current;
    setDragY(distance >= 0 ? distance : distance * 0.14);
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }
    const distance = Math.max(0, event.clientY - dragStartY.current);
    dragStartY.current = null;
    activePointerId.current = null;
    setDragging(false);

    if (distance >= DISMISS_THRESHOLD) {
      closeWith(onNotYet);
      return;
    }
    setDragY(0);
  };

  return (
    <Overlay
      $visible={animationReady && !closing}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeWith(onNotYet);
      }}
    >
      <Sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="departure-return-title"
        $visible={animationReady}
        $closing={closing}
        $dragging={dragging}
        $dragY={dragY}
      >
        <DragHandle
          type="button"
          aria-label="다녀온 공간 확인 바텀시트 움직이기"
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <i aria-hidden="true" />
        </DragHandle>
        <Content>
          <PlaceMark aria-hidden="true">
            <MapPinCheck />
          </PlaceMark>
          <Heading>
            <small>{placeName}</small>
            <h2 id="departure-return-title">
              잠깐 다른 공기를 만나고 오셨나요?
            </h2>
            <p>다녀온 순간을 짧게 남겨두면 다음 추천이 더 또렷해져요.</p>
          </Heading>
          <Actions>
            <VisitedButton type="button" onClick={() => closeWith(onVisited)}>
              다녀왔어요
            </VisitedButton>
            <NotYetButton type="button" onClick={() => closeWith(onNotYet)}>
              아직이에요
            </NotYetButton>
            <LaterButton type="button" onClick={() => closeWith(onLater)}>
              다음에 갈 공간으로 남겨두기
            </LaterButton>
          </Actions>
        </Content>
      </Sheet>
    </Overlay>
  );
}

const Overlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  z-index: 80;
  inset: 0;
  display: grid;
  align-items: end;
  background: rgb(var(--color-black-rgb) / 0.24);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity ${TRANSITION_DURATION}ms ease;
`;

const Sheet = styled.section<{
  $visible: boolean;
  $closing: boolean;
  $dragging: boolean;
  $dragY: number;
}>`
  width: 100%;
  overflow: hidden;
  border-radius: 30px 30px 0 0;
  background: linear-gradient(
    145deg,
    var(--color-surface) 45%,
    var(--color-secondary-100) 100%
  );
  box-shadow: 0 -18px 56px rgb(var(--color-black-rgb) / 0.18);
  transform: translateY(
    ${({ $visible, $closing, $dragY }) =>
      !$visible || $closing ? "calc(100% + 32px)" : `${$dragY}px`}
  );
  transition: ${({ $dragging }) =>
    $dragging
      ? "none"
      : `transform ${TRANSITION_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};

  @supports (corner-shape: squircle) {
    border-radius: 42px 42px 0 0;
    corner-shape: squircle;
  }
`;

const DragHandle = styled(BaseButton)`
  width: 80px;
  height: 30px;
  display: grid;
  place-items: center;
  margin-inline: auto;
  background: transparent;
  cursor: grab;
  touch-action: none;

  i {
    width: 42px;
    height: 4px;
    border-radius: 999px;
    background: var(--color-neutral-500);
  }
`;

const Content = styled.div`
  display: grid;
  gap: var(--space-5);
  padding: var(--space-1) var(--space-5)
    calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
`;

const PlaceMark = styled.div`
  width: var(--space-12);
  height: var(--space-12);
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--color-secondary-300);
  color: var(--color-secondary-1000);

  svg {
    width: 24px;
    height: 24px;
  }
`;

const Heading = styled.div`
  display: grid;
  gap: var(--space-2);

  small {
    color: var(--color-brand-800);
    font-size: var(--font-size-100);
    font-weight: 700;
  }

  h2 {
    max-width: 330px;
    font-size: var(--font-size-500);
    line-height: var(--line-height-heading);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
    line-height: var(--line-height-body);
  }
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
`;

const VisitedButton = styled(PrimaryButton)`
  min-height: var(--space-12);
`;

const NotYetButton = styled(BaseButton)`
  min-height: var(--space-12);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  font-weight: 600;
`;

const LaterButton = styled(TextButton)`
  grid-column: 1 / -1;
  justify-self: center;
  font-size: var(--font-size-100);
`;
