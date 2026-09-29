"use client";

import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import Image from "next/image";
import { ChevronUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { fluidByViewportHeight } from "@/styles/tokens";

export function RecommendationReadyScreen({
  onOpenRecommendations,
}: {
  onOpenRecommendations: () => void | Promise<void>;
}) {
  const animationReady = useDeferredAnimationStart();
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const completionStartedRef = useRef(false);

  const completeSwipe = useCallback((minimumOffset = 0) => {
    if (completionStartedRef.current || leaving) return;
    completionStartedRef.current = true;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setDragging(false);
    setLeaving(true);
    setDragOffset(Math.max(minimumOffset, window.innerHeight + 80, 800));
    transitionTimerRef.current = window.setTimeout(
      () => void onOpenRecommendations(),
      reduceMotion ? 100 : 620,
    );
  }, [leaving, onOpenRecommendations]);

  useEffect(
    () => () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    },
    [],
  );

  const startSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    if (leaving || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    pointerIdRef.current = event.pointerId;
    dragStartRef.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId || !dragging) return;
    setDragOffset(Math.max(0, dragStartRef.current - event.clientY));
  };

  const endSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const finalOffset = Math.max(
      dragOffset,
      dragStartRef.current - event.clientY,
    );
    pointerIdRef.current = null;
    setDragging(false);

    if (finalOffset >= 92) {
      completeSwipe(finalOffset);
      return;
    }

    setDragOffset(0);
  };

  const cancelSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    setDragging(false);
    setDragOffset(0);
  };

  const progress = Math.min(1, dragOffset / 560);

  return (
    <Frame
      data-animation-ready={animationReady}
      data-dragging={dragging || undefined}
      data-leaving={leaving || undefined}
      style={
        {
          "--ready-frame-y": `${-dragOffset}px`,
        } as CSSProperties
      }
      role="button"
      tabIndex={0}
      aria-label="위로 밀어 장소 보기"
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
      onPointerCancel={cancelSwipe}
      onKeyDown={(event) => {
        if (
          event.key === "ArrowUp" ||
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          completeSwipe();
        }
      }}
    >
      <Hero>
        <BrandMoment data-ready-logo>
          <BrandMotion $progress={progress}>
            <LogoGlow data-ready-glow aria-hidden="true" />
            <BrandMark
              src="/brand/tuti-symbol.svg"
              alt="Tuti"
              width={96}
              height={96}
              priority
              draggable={false}
            />
          </BrandMotion>
        </BrandMoment>
        <MessageReveal data-ready-copy>
          <Message $progress={progress}>
            딱 맞는 공기를 찾았어요.
            <br />
            이제 문 밖으로 나가볼까요?
          </Message>
        </MessageReveal>
      </Hero>
      <DecorativeLeaf
        $side="left"
        data-ready-leaf
        data-ready-leaf-left
        aria-hidden="true"
      >
        <LeafMotion $side="left" $progress={progress}>
          <Image
            src="/brand/decorations/leaf-left.png"
            alt=""
            width={533}
            height={347}
            draggable={false}
          />
        </LeafMotion>
      </DecorativeLeaf>
      <DecorativeLeaf
        $side="right"
        data-ready-leaf
        data-ready-leaf-right
        aria-hidden="true"
      >
        <LeafMotion $side="right" $progress={progress}>
          <Image
            src="/brand/decorations/leaf-right.png"
            alt=""
            width={533}
            height={347}
            draggable={false}
          />
        </LeafMotion>
      </DecorativeLeaf>
      <ActionArea data-ready-action>
        <SwipePrompt $progress={progress} aria-hidden="true">
          <ChevronCue>
            <ChevronUp size={30} strokeWidth={1.8} />
          </ChevronCue>
          <span>
            위로 밀어 장소 보기
          </span>
        </SwipePrompt>
      </ActionArea>
    </Frame>
  );
}

const revealBackground = keyframes`
  from {
    opacity: 0;
    transform: translateY(8%) scaleY(0.82);
  }

  to {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
`;

const revealLogo = keyframes`
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.9);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const spreadGlow = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.55);
  }

  45% {
    opacity: 0.72;
  }

  100% {
    opacity: 0;
    transform: scale(1.45);
  }
`;

const revealContent = keyframes`
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const nudgeChevron = keyframes`
  0%, 100% {
    transform: translateY(3px);
  }

  50% {
    transform: translateY(-3px);
  }
`;

const revealLeftLeaf = keyframes`
  from {
    opacity: 0;
    transform: translate(-16px, 10px) rotate(-8deg);
  }

  to {
    opacity: 1;
    transform: translate(0, 0) rotate(0);
  }
`;

const revealRightLeaf = keyframes`
  from {
    opacity: 0;
    transform: translate(16px, 10px) rotate(8deg);
  }

  to {
    opacity: 1;
    transform: translate(0, 0) rotate(0);
  }
`;

const Frame = styled(ScreenFrame)`
  --screen-padding-top: 0;
  --screen-padding-right: 0;
  --screen-padding-bottom: 0;
  --screen-padding-left: 0;

  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  background: var(--color-surface);
  cursor: grab;
  isolation: isolate;
  touch-action: none;
  transform: translate3d(0, var(--ready-frame-y, 0px), 0);
  transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
  user-select: none;
  will-change: transform;

  &[data-dragging="true"] {
    cursor: grabbing;
    transition: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-white);
    outline-offset: -6px;
  }

  &::before {
    position: absolute;
    z-index: 0;
    inset: 0;
    background: linear-gradient(
      180deg,
      var(--color-surface) 10%,
      var(--color-brand-100) 20%,
      var(--color-brand-500) 58%
    );
    content: "";
    opacity: 0;
    transform: translateY(8%) scaleY(0.82);
    transform-origin: bottom;
  }

  &[data-animation-ready="true"]::before {
    animation: ${revealBackground} 820ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  &[data-animation-ready="true"] [data-ready-logo] {
    animation: ${revealLogo} 620ms cubic-bezier(0.22, 1, 0.36, 1) 150ms both;
  }

  &[data-animation-ready="true"] [data-ready-glow] {
    animation: ${spreadGlow} 850ms ease-out 200ms both;
  }

  &[data-animation-ready="true"] [data-ready-copy] {
    animation: ${revealContent} 620ms cubic-bezier(0.22, 1, 0.36, 1) 320ms both;
  }

  &[data-animation-ready="true"] [data-ready-leaf-left] {
    animation: ${revealLeftLeaf} 760ms cubic-bezier(0.22, 1, 0.36, 1) 360ms
      both;
  }

  &[data-animation-ready="true"] [data-ready-leaf-right] {
    animation: ${revealRightLeaf} 760ms cubic-bezier(0.22, 1, 0.36, 1) 440ms
      both;
  }

  &[data-animation-ready="true"] [data-ready-action] {
    animation: ${revealContent} 620ms cubic-bezier(0.22, 1, 0.36, 1) 460ms both;
  }

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 80ms;

    &::before,
    [data-ready-logo],
    [data-ready-glow],
    [data-ready-copy],
    [data-ready-leaf],
    [data-ready-action] {
      animation-delay: 0ms !important;
    }
  }
`;

const Hero = styled.div`
  display: grid;
  align-content: start;
  justify-items: center;
  gap: var(--space-11);
  min-height: 0;
  padding: ${fluidByViewportHeight(148, 208)} var(--space-6) var(--space-8);
`;

const BrandMoment = styled.div`
  position: relative;
  opacity: 0;
  transform: translateY(12px) scale(0.9);
`;

const BrandMotion = styled.div<{ $progress: number }>`
  position: relative;
  opacity: ${({ $progress }) => Math.max(0, 1 - $progress * 0.78)};
  transform: translate3d(0, ${({ $progress }) => -54 * $progress}px, 0)
    scale(${({ $progress }) => 1 - $progress * 0.12});
  transition:
    opacity 600ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;

  [data-dragging="true"] & {
    transition: none;
  }
`;

const LogoGlow = styled.i`
  position: absolute;
  inset: -20px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgb(var(--color-white-rgb) / 0.72) 0%,
    rgb(var(--color-white-rgb) / 0.28) 42%,
    transparent 72%
  );
  opacity: 0;
  pointer-events: none;
  transform: scale(0.55);
`;

const BrandMark = styled(Image)`
  position: relative;
  width: 96px;
  height: 96px;
`;

const MessageReveal = styled.div`
  opacity: 0;
  transform: translateY(14px);
`;

const Message = styled.h2<{ $progress: number }>`
  margin: 0;
  color: var(--color-white);
  font-size: var(--font-size-700);
  font-weight: 600;
  line-height: var(--line-height-body);
  opacity: ${({ $progress }) => Math.max(0, 1 - $progress * 1.35)};
  text-align: center;
  transform: translate3d(0, ${({ $progress }) => -92 * $progress}px, 0)
    scale(${({ $progress }) => 1 - $progress * 0.04});
  transition:
    opacity 520ms ease-out,
    transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;

  [data-dragging="true"] & {
    transition: none;
  }
`;

const DecorativeLeaf = styled.div<{ $side: "left" | "right" }>`
  position: absolute;
  z-index: 2;
  top: ${({ $side }) =>
    $side === "left"
      ? fluidByViewportHeight(244, 322)
      : fluidByViewportHeight(348, 476)};
  ${({ $side }) =>
    $side === "left"
      ? "left: clamp(18px, 7.2%, 30px);"
      : "right: clamp(18px, 7.2%, 30px);"}
  width: ${({ $side }) =>
    $side === "left"
      ? fluidByViewportHeight(42, 52)
      : fluidByViewportHeight(46, 58)};
  opacity: 0;
  pointer-events: none;

  img {
    display: block;
    width: 100%;
    height: auto;
  }
`;

const LeafMotion = styled.div<{
  $side: "left" | "right";
  $progress: number;
}>`
  opacity: ${({ $progress }) =>
    1 - Math.max(0, Math.min(1, ($progress - 0.25) / 0.4))};
  transform: translate3d(
      ${({ $side, $progress }) =>
        ($side === "left" ? -46 : 46) * $progress}px,
      ${({ $side, $progress }) =>
        ($side === "left" ? -36 : -72) * $progress}px,
      0
    )
    rotate(
      ${({ $side, $progress }) =>
        ($side === "left" ? -14 : 18) * $progress}deg
    );
  transition:
    opacity 480ms ease-out,
    transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;

  [data-dragging="true"] & {
    transition: none;
  }
`;

const ActionArea = styled.div`
  opacity: 0;
  padding: var(--space-5)
    calc(var(--space-5) + var(--app-safe-area-right, 0px))
    calc(var(--space-10) + var(--app-safe-area-bottom, 0px))
    calc(var(--space-5) + var(--app-safe-area-left, 0px));
  transform: translateY(14px);
`;

const SwipePrompt = styled.div<{ $progress: number }>`
  min-height: 64px;
  display: grid;
  justify-items: center;
  gap: var(--space-1);
  color: var(--color-white);
  opacity: ${({ $progress }) => Math.max(0, 1 - $progress * 1.8)};
  transform: translate3d(0, ${({ $progress }) => -118 * $progress}px, 0);
  transition:
    opacity 360ms ease-out,
    transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;

  [data-dragging="true"] & {
    transition: none;
  }

  span {
    font-size: var(--font-size-100);
    font-weight: 500;
    letter-spacing: var(--letter-spacing-body);
  }
`;

const ChevronCue = styled.span`
  width: 44px;
  height: 30px;
  display: grid;
  place-items: center;
  animation: ${nudgeChevron} 1.4s ease-in-out infinite;

  [data-dragging="true"] &,
  [data-leaving="true"] & {
    animation-play-state: paused;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
