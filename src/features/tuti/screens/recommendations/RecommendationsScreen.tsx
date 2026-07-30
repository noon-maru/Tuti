"use client";

import { css, keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { useCallback, useEffect, useRef, useState } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { SwipeCard } from "@/features/tuti/components/SwipeCard";
import { DetailScreen } from "@/features/tuti/screens/detail/DetailScreen";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";
import type { TutiPlace } from "@/lib/recommendations";
import { fluidByViewportHeight } from "@/styles/tokens";

type Point = { x: number; y: number };
type DragAxis = "horizontal" | "vertical" | null;
type HelpKind = "cards" | "detail" | "journal";
type DetailPhase = "closed" | "open" | "closing";

const WHEEL_DELTA_LIMIT = 28;
const WHEEL_TRIGGER_THRESHOLD = 24;
const WHEEL_TRANSITION_DURATION = 260;

export function RecommendationsScreen({
  places,
  activeIndex,
  activePlace,
  onSelect,
  onMove,
  detailPhase,
  detailPlace,
  onDetail,
  onDetailExitStart,
  onDetailClose,
  onJournal,
  onAccount,
  onAdmin,
  onInquiry,
  onRestartIntake,
  onLogout,
  accountConnected,
  adminAccess,
  interactive,
  initialHelp,
  onInitialHelpShown,
}: {
  places: TutiPlace[];
  activeIndex: number;
  activePlace?: TutiPlace;
  onSelect: (index: number) => void;
  onMove: (direction: number) => void;
  detailPhase: DetailPhase;
  detailPlace?: TutiPlace;
  onDetail: () => void;
  onDetailExitStart: () => void;
  onDetailClose: () => void;
  onJournal: () => void;
  onAccount: () => void;
  onAdmin: () => void;
  onInquiry: () => void;
  onRestartIntake: () => void;
  onLogout: () => void | Promise<void>;
  accountConnected: boolean;
  adminAccess: boolean;
  interactive: boolean;
  initialHelp: HelpKind | null;
  onInitialHelpShown: (kind: HelpKind) => void;
}) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragAxis, setDragAxis] = useState<DragAxis>(null);
  const [committing, setCommitting] = useState(false);
  const [nudgingCard, setNudgingCard] = useState<"up" | "down" | null>(null);
  const [pressedCardIndex, setPressedCardIndex] = useState<number | null>(null);
  const [currentHelp, setCurrentHelp] = useState<HelpKind | null>(null);
  const [displayedHelp, setDisplayedHelp] = useState<HelpKind | null>(null);
  const wheelDragY = useRef(0);
  const wheelAnimationFrame = useRef<number | null>(null);
  const wheelResetTimer = useRef<number | null>(null);
  const wheelUnlockTimer = useRef<number | null>(null);
  const wheelLocked = useRef(false);
  const verticalProgress =
    dragAxis === "vertical" ? Math.min(Math.abs(dragOffset.y) / 140, 1) : 0;
  const transitionTarget = dragOffset.y < 0 ? "detail" : "journal";
  const detailOpen = detailPhase === "open";
  const detailVisible = detailPhase !== "closed";
  const presentedDetailPlace = detailVisible ? detailPlace : activePlace;
  const mainInteractive = interactive && !detailOpen;
  const helpVisible =
    mainInteractive &&
    Boolean(currentHelp) &&
    verticalProgress === 0 &&
    dragAxis === null &&
    !committing;

  const resetDrag = useCallback(() => {
    wheelDragY.current = 0;

    if (wheelResetTimer.current) {
      window.clearTimeout(wheelResetTimer.current);
      wheelResetTimer.current = null;
    }

    if (wheelAnimationFrame.current) {
      window.cancelAnimationFrame(wheelAnimationFrame.current);
      wheelAnimationFrame.current = null;
    }

    setDragStart(null);
    setDragOffset({ x: 0, y: 0 });
    setDragAxis(null);
    setCommitting(false);
    setPressedCardIndex(null);
  }, []);

  const nudgeActiveCard = useCallback((direction: "up" | "down" = "up") => {
    if (committing) return;

    setNudgingCard(null);
    window.setTimeout(() => {
      setNudgingCard(direction);
      window.setTimeout(() => setNudgingCard(null), 560);
    }, 0);
  }, [committing]);

  const completeHelp = useCallback((kind: HelpKind) => {
    if (currentHelp !== kind) return;

    onInitialHelpShown(kind);
    setCurrentHelp(null);
  }, [currentHelp, onInitialHelpShown]);

  useEffect(() => {
    if (!initialHelp || currentHelp || dragStart || committing || verticalProgress > 0) {
      return undefined;
    }

    const showTimeout = window.setTimeout(() => {
      setCurrentHelp(initialHelp);
      setDisplayedHelp(initialHelp);
    }, 260);

    return () => window.clearTimeout(showTimeout);
  }, [initialHelp, currentHelp, dragStart, committing, verticalProgress]);

  useEffect(() => {
    if (mainInteractive) return;

    // The gesture state must be cleared in the same commit that disables interaction.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetDrag();
    setCurrentHelp(null);
    setNudgingCard(null);
  }, [mainInteractive, resetDrag]);

  useEffect(
    () => () => {
      if (wheelResetTimer.current) {
        window.clearTimeout(wheelResetTimer.current);
      }

      if (wheelAnimationFrame.current) {
        window.cancelAnimationFrame(wheelAnimationFrame.current);
      }

      if (wheelUnlockTimer.current) {
        window.clearTimeout(wheelUnlockTimer.current);
      }
    },
    [],
  );

  const commitVerticalTransition = (direction: -1 | 1) => {
    wheelDragY.current = 0;

    if (wheelResetTimer.current) {
      window.clearTimeout(wheelResetTimer.current);
      wheelResetTimer.current = null;
    }

    setCommitting(true);
    setDragAxis("vertical");
    setDragStart(null);
    setDragOffset({ x: 0, y: direction * 160 });
    window.setTimeout(() => {
      if (direction < 0) {
        onDetail();
      } else {
        onJournal();
      }
    }, 120);
  };

  const animateWheelTransition = (
    direction: -1 | 1,
    initialDragY: number,
  ) => {
    const targetDragY = direction * 160;
    const startedAt = window.performance.now();

    wheelDragY.current = 0;

    if (wheelResetTimer.current) {
      window.clearTimeout(wheelResetTimer.current);
      wheelResetTimer.current = null;
    }

    if (wheelAnimationFrame.current) {
      window.cancelAnimationFrame(wheelAnimationFrame.current);
    }

    setCommitting(true);
    setDragAxis("vertical");
    setDragStart(null);
    setDragOffset({ x: 0, y: initialDragY });

    const animate = (time: number) => {
      const progress = Math.min(
        (time - startedAt) / WHEEL_TRANSITION_DURATION,
        1,
      );
      const easedProgress = 1 - (1 - progress) ** 3;
      const nextDragY =
        initialDragY +
        (targetDragY - initialDragY) * easedProgress;

      setDragOffset({ x: 0, y: nextDragY });

      if (progress < 1) {
        wheelAnimationFrame.current =
          window.requestAnimationFrame(animate);
        return;
      }

      wheelAnimationFrame.current = null;

      if (direction < 0) {
        onDetail();
      } else {
        onJournal();
      }
    };

    wheelAnimationFrame.current = window.requestAnimationFrame(animate);
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!mainInteractive) return;

    const cardElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-swipe-card-index]",
    );
    if (!cardElement) return;

    wheelDragY.current = 0;

    if (wheelAnimationFrame.current) {
      window.cancelAnimationFrame(wheelAnimationFrame.current);
      wheelAnimationFrame.current = null;
    }

    if (wheelResetTimer.current) {
      window.clearTimeout(wheelResetTimer.current);
      wheelResetTimer.current = null;
    }

    const point = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDragOffset({ x: 0, y: 0 });
    setDragAxis(null);
    setCommitting(false);
    setPressedCardIndex(Number(cardElement.dataset.swipeCardIndex));
  };

  const updateDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragStart) return;

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const nextAxis =
      dragAxis ??
      (Math.abs(dx) > 8 || Math.abs(dy) > 8
        ? Math.abs(dx) >= Math.abs(dy)
          ? "horizontal"
          : "vertical"
        : null);

    if (nextAxis !== dragAxis) {
      setDragAxis(nextAxis);
    }

    if (detailPhase === "closing" && nextAxis === "vertical") {
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    setDragOffset({
      x: nextAxis === "horizontal" ? dx : 0,
      y: nextAxis === "vertical" ? dy : 0,
    });
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragStart) return;

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const axis = dragAxis ?? (Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical");

    if (detailPhase === "closing" && axis === "vertical") {
      resetDrag();
      return;
    }

    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && pressedCardIndex !== null) {
      if (pressedCardIndex === activeIndex) {
        nudgeActiveCard();
      } else {
        onSelect(pressedCardIndex);
      }

      resetDrag();
      return;
    }

    if (axis === "horizontal" && Math.abs(dx) > 36) {
      if (currentHelp && currentHelp !== "cards") {
        resetDrag();
        return;
      }

      completeHelp("cards");
      onMove(dx < 0 ? 1 : -1);
      resetDrag();
      return;
    }

    if (axis === "vertical" && Math.abs(dy) > 48) {
      const direction = dy < 0 ? -1 : 1;

      if (
        (currentHelp === "cards") ||
        (currentHelp === "detail" && direction !== -1) ||
        (currentHelp === "journal" && direction !== 1)
      ) {
        resetDrag();
        return;
      }

      if (direction < 0) {
        completeHelp("detail");
      } else {
        completeHelp("journal");
      }

      commitVerticalTransition(direction);
      return;
    }

    resetDrag();
  };

  const cancelDrag = () => {
    resetDrag();
  };

  const scrollCard = (event: React.WheelEvent<HTMLDivElement>) => {
    const cardElement = (event.target as HTMLElement).closest(
      "[data-swipe-card-index]",
    );
    const verticalIntent =
      Math.abs(event.deltaY) > Math.abs(event.deltaX);

    if (
      !cardElement ||
      !mainInteractive ||
      detailPhase === "closing" ||
      !verticalIntent
    ) {
      return;
    }

    event.preventDefault();

    if (committing || wheelLocked.current) return;

    const wheelDelta = Math.max(
      -WHEEL_DELTA_LIMIT,
      Math.min(normalizeWheelDelta(event), WHEEL_DELTA_LIMIT),
    );
    const nextDragY = Math.max(
      -160,
      Math.min(
        wheelDragY.current + wheelDelta,
        160,
      ),
    );

    wheelDragY.current = nextDragY;
    setDragStart(null);
    setDragAxis("vertical");
    setDragOffset({ x: 0, y: nextDragY });

    if (Math.abs(nextDragY) >= WHEEL_TRIGGER_THRESHOLD) {
      const direction = nextDragY < 0 ? -1 : 1;

      if (
        currentHelp === "cards" ||
        (currentHelp === "detail" && direction !== -1) ||
        (currentHelp === "journal" && direction !== 1)
      ) {
        resetDrag();
        return;
      }

      if (direction < 0) {
        completeHelp("detail");
      } else {
        completeHelp("journal");
      }

      wheelLocked.current = true;
      animateWheelTransition(direction, nextDragY);
      wheelUnlockTimer.current = window.setTimeout(() => {
        wheelLocked.current = false;
        wheelUnlockTimer.current = null;
      }, WHEEL_TRANSITION_DURATION + 320);
      return;
    }

    if (wheelResetTimer.current) {
      window.clearTimeout(wheelResetTimer.current);
    }

    wheelResetTimer.current = window.setTimeout(() => {
      resetDrag();
    }, 140);
  };

  return (
    <Frame
      $interactive={interactive}
      aria-hidden={!interactive}
      inert={!interactive}
      onPointerDown={startDrag}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
    >
      <CurrentLayer
        $progress={verticalProgress}
        $dragY={dragOffset.y}
        aria-hidden={!mainInteractive}
        inert={!mainInteractive}
      >
        <AccountMenu>
          <ContextMenu
            label="메인 메뉴"
            items={
              accountConnected
                ? [
                    {
                      label: "계정 관리",
                      onSelect: onAccount,
                    },
                    ...(adminAccess
                      ? [
                          {
                            label: "관리자 페이지",
                            onSelect: onAdmin,
                          },
                        ]
                      : []),
                    {
                      label: "오늘 다시 고르기",
                      onSelect: onRestartIntake,
                    },
                    {
                      label: "1:1 문의",
                      onSelect: onInquiry,
                    },
                    {
                      label: "로그아웃",
                      onSelect: onLogout,
                      tone: "danger",
                    },
                  ]
                : [
                    {
                      label: "기록 불러오기",
                      onSelect: onAccount,
                    },
                    {
                      label: "오늘 다시 고르기",
                      onSelect: onRestartIntake,
                    },
                    {
                      label: "1:1 문의",
                      onSelect: onInquiry,
                    },
                  ]
            }
          />
        </AccountMenu>
        <Copy $progress={verticalProgress}>
          <h1>오늘 가능한 정도</h1>
          <p>
            {activePlace?.reason ?? "지금의 마음에 맞는 장소를 찾고 있어요."}
          </p>
        </Copy>
        <Carousel onWheel={scrollCard}>
          {places.map((place, index) => (
            <SwipeCard
              key={place.id}
              cardIndex={index}
              place={place}
              offset={getOffset(index, activeIndex, places.length)}
              active={index === activeIndex}
              drag={dragStart || committing ? dragOffset : undefined}
              nudging={index === activeIndex ? nudgingCard : null}
              detailProgress={
                index === activeIndex && transitionTarget === "detail"
                  ? verticalProgress
                  : 0
              }
            />
          ))}
        </Carousel>
        <Dots $progress={verticalProgress}>
          {places.map((place, index) => (
            <Dot
              key={place.id}
              type="button"
              aria-label={`${index + 1}번째 카드`}
              aria-pressed={index === activeIndex}
              $active={index === activeIndex}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSelect(index)}
            />
          ))}
        </Dots>
      </CurrentLayer>

      {presentedDetailPlace &&
        (detailVisible ||
          (mainInteractive &&
            verticalProgress > 0 &&
            transitionTarget === "detail")) && (
          <DetailTransitionLayer
            $interactive={detailOpen}
            aria-hidden={!detailOpen}
          >
            <DetailScreen
              place={presentedDetailPlace}
              onBack={onDetailClose}
              onExitStart={onDetailExitStart}
              historyActive={detailVisible}
              revealProgress={detailVisible ? 1 : verticalProgress}
            />
          </DetailTransitionLayer>
        )}

      {mainInteractive &&
        activePlace &&
        verticalProgress > 0 &&
        transitionTarget === "journal" && (
          <TransitionLayer $progress={verticalProgress} $from={-34}>
            <JournalScreen onBack={() => undefined} />
          </TransitionLayer>
        )}

      <HelpOverlay
        $visible={helpVisible}
        $kind={displayedHelp ?? "cards"}
        aria-hidden={!helpVisible}
        aria-live="polite"
      >
        {displayedHelp && (
          <HelpContent key={displayedHelp} $kind={displayedHelp}>
            <GestureCue $kind={displayedHelp} aria-hidden="true">
              <GestureArrows $kind={displayedHelp}>
                {displayedHelp === "cards" ? (
                  <>
                    <GestureArrowPair $direction="left">
                      <i />
                      <i />
                    </GestureArrowPair>
                    <GestureArrowPair $direction="right">
                      <i />
                      <i />
                    </GestureArrowPair>
                  </>
                ) : (
                  <GestureArrowPair
                    $direction={
                      displayedHelp === "detail" ? "up" : "down"
                    }
                  >
                    <i />
                    <i />
                  </GestureArrowPair>
                )}
              </GestureArrows>
              <GestureThumb $kind={displayedHelp} />
            </GestureCue>
            <HelpMessage $kind={displayedHelp}>
              {displayedHelp === "cards"
                ? "준비된 장소들의 공기를 살펴보세요"
                : displayedHelp === "detail"
                  ? "위로 올려 상세한 정보를 확인해보세요"
                  : "아래로 내려 지나간 공간을 기록해보세요"}
            </HelpMessage>
          </HelpContent>
        )}
      </HelpOverlay>
    </Frame>
  );
}

function normalizeWheelDelta(event: React.WheelEvent<HTMLElement>) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * window.innerHeight;
  }

  return event.deltaY;
}

function getOffset(index: number, active: number, length: number) {
  const raw = index - active;
  if (raw > length / 2) return raw - length;
  if (raw < -length / 2) return raw + length;
  return raw;
}

const Frame = styled(ScreenFrame)<{ $interactive: boolean }>`
  z-index: 0;
  justify-content: space-between;
  overflow: hidden;
  touch-action: none;
  pointer-events: ${({ $interactive }) => ($interactive ? "auto" : "none")};
  isolation: isolate;
`;

const CurrentLayer = styled.div<{ $progress: number; $dragY: number }>`
  position: absolute;
  inset: var(--screen-padding-top) var(--screen-padding-right)
    var(--screen-padding-bottom) var(--screen-padding-left);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  transform: translateY(${({ $dragY }) => $dragY * 0.02}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "transform 260ms ease"};

`;

const DetailTransitionLayer = styled.div<{ $interactive: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: ${({ $interactive }) => ($interactive ? "auto" : "none")};
`;

const AccountMenu = styled.div`
  position: absolute;
  top: calc(var(--space-3) * -1);
  right: calc(var(--space-3) * -1);
  z-index: 10;
`;

const TransitionLayer = styled.div<{ $progress: number; $from: number }>`
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  opacity: ${({ $progress }) => $progress};
  transform: translateY(${({ $progress, $from }) => $from * (1 - $progress)}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 220ms ease, transform 240ms ease"};
`;

const helpContentIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const moveHorizontally = keyframes`
  0%,
  100% {
    transform: translate(calc(-50% - 54px), -50%);
  }

  50% {
    transform: translate(calc(-50% + 54px), -50%);
  }
`;

const moveUp = keyframes`
  0%,
  12% {
    transform: translate(-50%, calc(-50% + 28px));
    opacity: 0;
  }

  18% {
    transform: translate(-50%, calc(-50% + 28px));
    opacity: 1;
  }

  76% {
    transform: translate(-50%, calc(-50% - 28px));
    opacity: 1;
  }

  82% {
    transform: translate(-50%, calc(-50% - 28px));
    opacity: 0;
  }

  82.01%,
  100% {
    transform: translate(-50%, calc(-50% + 28px));
    opacity: 0;
  }
`;

const moveDown = keyframes`
  0%,
  12% {
    transform: translate(-50%, calc(-50% - 28px));
    opacity: 0;
  }

  18% {
    transform: translate(-50%, calc(-50% - 28px));
    opacity: 1;
  }

  76% {
    transform: translate(-50%, calc(-50% + 28px));
    opacity: 1;
  }

  82% {
    transform: translate(-50%, calc(-50% + 28px));
    opacity: 0;
  }

  82.01%,
  100% {
    transform: translate(-50%, calc(-50% - 28px));
    opacity: 0;
  }
`;

const HelpOverlay = styled.div<{
  $visible: boolean;
  $kind: HelpKind;
}>`
  position: absolute;
  inset: 0;
  z-index: 30;
  overflow: hidden;
  background:
    ${({ $kind }) =>
      $kind === "detail"
        ? `linear-gradient(
            to top,
            color-mix(in srgb, var(--color-secondary-500) 68%, transparent) 0%,
            color-mix(in srgb, var(--color-secondary-300) 34%, transparent) 26%,
            transparent 58%
          )`
        : $kind === "journal"
          ? `linear-gradient(
              to bottom,
              color-mix(in srgb, var(--color-secondary-500) 58%, transparent) 0%,
              color-mix(in srgb, var(--color-secondary-300) 28%, transparent) 24%,
              transparent 55%
            )`
          : "linear-gradient(transparent, transparent)"},
    color-mix(in srgb, var(--color-neutral-1300) 58%, transparent);
  color: var(--color-neutral-100);
  pointer-events: none;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 300ms ease, background 360ms ease;
`;

const HelpContent = styled.div<{ $kind: HelpKind }>`
  position: absolute;
  inset: 0;
  animation: ${css`${helpContentIn} 300ms ease both`};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const HelpMessage = styled.p<{ $kind: HelpKind }>`
  position: absolute;
  left: var(--space-6);
  right: var(--space-6);
  ${({ $kind }) =>
    $kind === "cards"
      ? "top: 52%;"
      : $kind === "detail"
        ? "bottom: calc(10% + var(--app-safe-area-bottom, 0px));"
        : "top: calc(16% + var(--app-safe-area-top, 0px));"}
  margin: 0;
  color: var(--color-neutral-100);
  font-size: var(--font-size-300);
  font-weight: 600;
  line-height: var(--line-height-subtitle);
  letter-spacing: var(--letter-spacing-subtitle);
  text-align: center;
  text-shadow: 0 1px 8px
    color-mix(in srgb, var(--color-neutral-1300) 42%, transparent);
`;

const GestureCue = styled.div<{ $kind: HelpKind }>`
  position: absolute;
  left: 50%;
  ${({ $kind }) =>
    $kind === "cards"
      ? `
        top: 43%;
        width: min(52%, 200px);
        height: 32px;
        transform: translate(-50%, -50%);
      `
      : $kind === "detail"
        ? `
          bottom: calc(17% + var(--app-safe-area-bottom, 0px));
          width: 32px;
          height: 96px;
          transform: translateX(-50%);
        `
        : `
          top: calc(23% + var(--app-safe-area-top, 0px));
          width: 32px;
          height: 96px;
          transform: translateX(-50%);
        `}
  border-radius: 999px;
  background: ${({ $kind }) =>
    $kind === "cards"
      ? `linear-gradient(
          90deg,
          transparent,
          color-mix(in srgb, var(--color-secondary-500) 92%, transparent) 22%,
          var(--color-secondary-500) 50%,
          color-mix(in srgb, var(--color-secondary-500) 92%, transparent) 78%,
          transparent
        )`
      : $kind === "detail"
        ? `linear-gradient(
            to top,
            var(--color-secondary-500),
            color-mix(in srgb, var(--color-secondary-500) 72%, transparent) 58%,
            transparent
          )`
        : `linear-gradient(
            to bottom,
            var(--color-secondary-500),
            color-mix(in srgb, var(--color-secondary-500) 72%, transparent) 58%,
            transparent
          )`};
`;

const GestureArrows = styled.div<{ $kind: HelpKind }>`
  position: absolute;
  inset: 0;
  display: flex;
  ${({ $kind }) =>
    $kind === "cards"
      ? `
        align-items: center;
        justify-content: center;
        gap: 34px;
      `
      : `
        align-items: center;
        justify-content: center;
      `}
  color: color-mix(in srgb, var(--color-neutral-100) 72%, transparent);
`;

const GestureArrowPair = styled.span<{
  $direction: "left" | "right" | "up" | "down";
}>`
  display: flex;
  flex-direction: ${({ $direction }) =>
    $direction === "up" || $direction === "down" ? "column" : "row"};
  gap: ${({ $direction }) =>
    $direction === "up" || $direction === "down" ? "0" : "1px"};

  i {
    width: 8px;
    height: 8px;
    display: block;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    transform: rotate(
      ${({ $direction }) =>
        $direction === "left"
          ? "135deg"
          : $direction === "right"
            ? "-45deg"
            : $direction === "up"
              ? "-135deg"
              : "45deg"}
    );
  }
`;

const GestureThumb = styled.div<{ $kind: HelpKind }>`
  position: absolute;
  left: 50%;
  top: 50%;
  width: 22px;
  height: 22px;
  border: 3px solid
    color-mix(in srgb, var(--color-secondary-900) 28%, transparent);
  border-radius: 50%;
  background: var(--color-secondary-500);
  box-shadow:
    0 0 0 4px
      color-mix(in srgb, var(--color-secondary-200) 34%, transparent),
    0 4px 12px
      color-mix(in srgb, var(--color-neutral-1300) 28%, transparent);
  animation: ${({ $kind }) =>
    $kind === "cards"
      ? css`${moveHorizontally} 1800ms ease-in-out infinite`
      : $kind === "detail"
        ? css`${moveUp} 1500ms ease-out infinite`
        : css`${moveDown} 1500ms ease-out infinite`};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transform: translate(-50%, -50%);
  }
`;

const Copy = styled.div<{ $progress: number }>`
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  text-align: center;
  opacity: ${({ $progress }) => Math.max(0, 1 - $progress * 2)};
  transform: translateY(${({ $progress }) => $progress * -8}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 220ms ease, transform 240ms ease"};

  h1 {
    font-size: var(--font-size-500);
    font-weight: 600;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  p {
    max-width: 300px;
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const Carousel = styled.div`
  position: relative;
  height: ${fluidByViewportHeight(480, 520)};
  margin-top: ${fluidByViewportHeight(8, 56)};
  display: grid;
  place-items: center;
  perspective: 900px;
`;

const Dots = styled.div<{ $progress: number }>`
  width: fit-content;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  align-self: center;
  margin-top: auto;
  padding: 0 var(--space-2);
  border-radius: 999px;
  background: rgb(var(--color-white-rgb) / 0.34);
  opacity: ${({ $progress }) => Math.max(0, 1 - $progress * 2)};
  transform: translateY(${({ $progress }) => $progress * 8}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 220ms ease, transform 240ms ease"};
`;

const Dot = styled(BaseButton)<{ $active: boolean }>`
  width: 30px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: transparent;
  touch-action: manipulation;

  &::after {
    content: "";
    width: ${({ $active }) => ($active ? "18px" : "6px")};
    height: 6px;
    border-radius: 999px;
    background: ${({ $active }) =>
      $active ? "var(--color-text)" : "var(--color-border)"};
    transition: width 160ms ease, height 160ms ease, background 160ms ease;
  }
`;
