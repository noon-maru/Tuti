"use client";

import styled from "@emotion/styled";
import {
  CalendarDays,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Ticket,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { PlaceShareDialog } from "@/features/tuti/components/PlaceShareDialog";
import { TutiPlaceIcon } from "@/features/tuti/components/TutiPlaceIcon";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { usePlaceDetail } from "@/features/tuti/hooks/usePlaceDetail";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import {
  getPlaceDisplayPhrase,
  getPlaceReasonHeadline,
} from "@/features/tuti/lib/placeDisplayCopy";
import { createOverviewPreview } from "@/features/tuti/lib/placeOverviewSummary";
import {
  createOperationBadge,
  createVisitInformationFacts,
  type VisitInformationFact,
} from "@/features/tuti/lib/visitInformation";
import {
  getCrowdForecastBasisLabel,
  getCrowdForecastKindLabel,
  getCrowdForecastLevelLabel,
  getWeatherForecastLabel,
  type TutiPlace,
} from "@/lib/recommendations";
import type { TourismPlaceDetailImage } from "@/shared/api/placeDetails";
import { fluidByViewportHeight } from "@/styles/tokens";

const DETAIL_EXIT_DURATION = 480;
const DETAIL_EXIT_FRAME_BUFFER = 34;
const DETAIL_READING_DISTANCE = 180;
const DETAIL_READING_SNAP_DURATION = 420;
const DETAIL_READING_WHEEL_SETTLE = 120;
const DETAIL_POINTER_INERTIA_FRICTION = 0.92;
const DETAIL_POINTER_INERTIA_MIN_VELOCITY = 0.02;
const DETAIL_POINTER_INERTIA_MAX_VELOCITY = 2.4;
const DETAIL_HISTORY_STATE_KEY = "__tutiDetailOverlay";
const PHOTO_VIEWER_DURATION = 560;
const PHOTO_VIEWER_ZOOM = 1.65;
const PHOTO_DRAG_THRESHOLD = 4;

type DetailLayoutMetrics = {
  contentCollapseDistance: number;
  heroHeight: number;
  heroLeft: number;
  heroTop: number;
  heroWidth: number;
};

type DetailTouchGesture = {
  descriptionScrollTop: number;
  readingProgress: number;
  startedInDescription: boolean;
  startY: number;
};

type DetailPointerGesture = DetailTouchGesture & {
  lastTimestamp: number;
  lastY: number;
  pointerId: number;
  velocity: number;
};

export function DetailScreen({
  place,
  travelTimeLabel,
  onBack,
  backLabel = "추천 화면으로 돌아가기",
  showBackMenuItem = false,
  savedForLater = false,
  onToggleSavedForLater,
  onExitStart,
  historyActive = false,
  revealProgress = 1,
}: {
  place: TutiPlace;
  travelTimeLabel: string;
  onBack: () => void;
  backLabel?: string;
  showBackMenuItem?: boolean;
  savedForLater?: boolean;
  onToggleSavedForLater?: () => void;
  onExitStart?: () => void;
  historyActive?: boolean;
  revealProgress?: number;
}) {
  const detailQuery = usePlaceDetail(place.id);
  const detailResponse = detailQuery.data;
  const detail = detailResponse?.detail ?? null;
  const locationLabel =
    detailResponse?.place.region ?? detailResponse?.place.address;
  const facts = detailQuery.isPending
    ? []
    : createVisitInformationFacts(detail);
  const crowdBadge = createCrowdBadge(place);
  const operationBadge = detailQuery.isPending
    ? null
    : createOperationBadge(detail);
  const hasUncertainVisitInformation = facts.some(
    (fact) => fact.needsVerification,
  );
  const weatherBadge = place.weatherForecast
    ? getWeatherForecastLabel(place.weatherForecast)
    : null;
  const subtitle = createPlaceSubtitle(place);
  const overviewRegionId = useId();
  const rawOverview = detail?.overview?.trim() ?? null;
  const overviewSummary = createOverviewPreview(
    detail?.overviewSummary?.trim() ?? null,
    rawOverview,
    getFallbackDescription(place),
  );
  const canShowRawOverview =
    Boolean(rawOverview) &&
    rawOverview?.replace(/\s+/g, " ").trim() !== overviewSummary.trim();
  const [selectedPhoto, setSelectedPhoto] =
    useState<TourismPlaceDetailImage | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [expandedOverviewPlaceId, setExpandedOverviewPlaceId] = useState<
    string | null
  >(null);
  const rawOverviewExpanded = expandedOverviewPlaceId === place.id;
  const [readingProgress, setReadingProgress] = useState(0);
  const [pointerDismissY, setPointerDismissY] = useState(0);
  const [pointerDismissDragging, setPointerDismissDragging] = useState(false);
  const [layoutMetrics, setLayoutMetrics] =
    useState<DetailLayoutMetrics | null>(null);
  const readingProgressRef = useRef(0);
  const requestedReadingProgress = useRef(0);
  const readingFrame = useRef<number | null>(null);
  const readingSnapFrame = useRef<number | null>(null);
  const readingWheelTimer = useRef<number | null>(null);
  const pointerInertiaFrame = useRef<number | null>(null);
  const pointerDismissFrame = useRef<number | null>(null);
  const pointerDismissYRef = useRef(0);
  const requestedPointerDismissY = useRef(0);
  const sheetRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const detailTouchGesture = useRef<DetailTouchGesture | null>(null);
  const detailPointerGesture = useRef<DetailPointerGesture | null>(null);
  const ownsHistoryEntry = useRef(false);
  const closingFromHistory = useRef(false);
  const ignoreNextPopState = useRef(false);
  const finishCloseRef = useRef<() => void>(() => undefined);
  const requestExitRef = useRef<() => Promise<void>>(
    () => Promise.resolve(),
  );
  const finishClose = () => {
    const shouldRemoveHistoryEntry =
      ownsHistoryEntry.current && !closingFromHistory.current;

    ownsHistoryEntry.current = false;
    closingFromHistory.current = false;
    onBack();

    if (shouldRemoveHistoryEntry) {
      ignoreNextPopState.current = true;
      window.history.back();
    }
  };
  const swipeBack = useVerticalSwipeBack({
    direction: "down",
    onBack: finishClose,
    onExitStart,
    exitDelay: DETAIL_EXIT_DURATION + DETAIL_EXIT_FRAME_BUFFER,
  });

  useLayoutEffect(() => {
    finishCloseRef.current = finishClose;
    requestExitRef.current = swipeBack.requestExit;
  });

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const hero = heroRef.current;
    const summary = summaryRef.current;
    if (!sheet || !hero || !summary) return;

    const measureCollapsedLayout = () => {
      if (readingProgressRef.current > 0.001) return;

      const sheetRect = sheet.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();

      setLayoutMetrics({
        contentCollapseDistance: Math.max(
          0,
          summaryRect.top - sheetRect.top - 28,
        ),
        heroHeight: heroRect.height,
        heroLeft: heroRect.left - sheetRect.left,
        heroTop: heroRect.top - sheetRect.top,
        heroWidth: heroRect.width,
      });
    };

    const frame = window.requestAnimationFrame(measureCollapsedLayout);
    const resizeObserver = new ResizeObserver(measureCollapsedLayout);
    resizeObserver.observe(sheet);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [place.id]);

  useEffect(
    () => () => {
      if (readingFrame.current !== null) {
        window.cancelAnimationFrame(readingFrame.current);
      }
      if (readingSnapFrame.current !== null) {
        window.cancelAnimationFrame(readingSnapFrame.current);
      }
      if (readingWheelTimer.current !== null) {
        window.clearTimeout(readingWheelTimer.current);
      }
      if (pointerInertiaFrame.current !== null) {
        window.cancelAnimationFrame(pointerInertiaFrame.current);
      }
      if (pointerDismissFrame.current !== null) {
        window.cancelAnimationFrame(pointerDismissFrame.current);
      }
    },
    [],
  );

  const updateReadingProgress = (nextProgress: number) => {
    if (readingSnapFrame.current !== null) {
      window.cancelAnimationFrame(readingSnapFrame.current);
      readingSnapFrame.current = null;
    }

    const clampedProgress = clamp(nextProgress, 0, 1);
    readingProgressRef.current = clampedProgress;
    requestedReadingProgress.current = clampedProgress;

    if (readingFrame.current !== null) return;

    readingFrame.current = window.requestAnimationFrame(() => {
      const nextProgress = requestedReadingProgress.current;
      setReadingProgress(nextProgress);
      readingFrame.current = null;
    });
  };

  const snapReadingProgress = (targetProgress: 0 | 1) => {
    if (readingFrame.current !== null) {
      window.cancelAnimationFrame(readingFrame.current);
      readingFrame.current = null;
    }
    if (readingSnapFrame.current !== null) {
      window.cancelAnimationFrame(readingSnapFrame.current);
    }

    const startProgress = readingProgressRef.current;
    const distance = Math.abs(targetProgress - startProgress);
    if (distance < 0.001) {
      readingProgressRef.current = targetProgress;
      requestedReadingProgress.current = targetProgress;
      setReadingProgress(targetProgress);
      readingSnapFrame.current = null;
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reduceMotion
      ? 1
      : Math.max(220, DETAIL_READING_SNAP_DURATION * distance);
    const startedAt = performance.now();

    const animate = (timestamp: number) => {
      const elapsed = clamp((timestamp - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const nextProgress = lerp(startProgress, targetProgress, eased);

      readingProgressRef.current = nextProgress;
      requestedReadingProgress.current = nextProgress;
      setReadingProgress(nextProgress);

      if (elapsed < 1) {
        readingSnapFrame.current = window.requestAnimationFrame(animate);
        return;
      }

      readingSnapFrame.current = null;
    };

    readingSnapFrame.current = window.requestAnimationFrame(animate);
  };

  const settleReadingProgress = (direction: number) => {
    const currentProgress = readingProgressRef.current;
    const targetProgress =
      direction > 0
        ? 1
        : direction < 0
          ? 0
          : currentProgress >= 0.5
            ? 1
            : 0;
    snapReadingProgress(targetProgress);
  };

  const stopPointerInertia = () => {
    if (pointerInertiaFrame.current === null) return;
    window.cancelAnimationFrame(pointerInertiaFrame.current);
    pointerInertiaFrame.current = null;
  };

  const startPointerInertia = (initialVelocity: number) => {
    const description = descriptionRef.current;
    if (
      !description ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    stopPointerInertia();
    let velocity = clamp(
      initialVelocity,
      -DETAIL_POINTER_INERTIA_MAX_VELOCITY,
      DETAIL_POINTER_INERTIA_MAX_VELOCITY,
    );
    let previousTimestamp = performance.now();

    const glide = (timestamp: number) => {
      const elapsed = Math.min(32, Math.max(1, timestamp - previousTimestamp));
      previousTimestamp = timestamp;

      const previousScrollTop = description.scrollTop;
      const maximumScrollTop = Math.max(
        0,
        description.scrollHeight - description.clientHeight,
      );
      const nextScrollTop = clamp(
        previousScrollTop + velocity * elapsed,
        0,
        maximumScrollTop,
      );
      description.scrollTop = nextScrollTop;
      velocity *= Math.pow(
        DETAIL_POINTER_INERTIA_FRICTION,
        elapsed / (1000 / 60),
      );

      const reachedBoundary =
        (nextScrollTop <= 0 && velocity < 0) ||
        (nextScrollTop >= maximumScrollTop && velocity > 0);
      if (
        reachedBoundary ||
        Math.abs(velocity) < DETAIL_POINTER_INERTIA_MIN_VELOCITY
      ) {
        pointerInertiaFrame.current = null;
        return;
      }

      pointerInertiaFrame.current = window.requestAnimationFrame(glide);
    };

    pointerInertiaFrame.current = window.requestAnimationFrame(glide);
  };

  const updatePointerDismissY = (nextDragY: number) => {
    const clampedDragY = Math.max(0, nextDragY);
    pointerDismissYRef.current = clampedDragY;
    requestedPointerDismissY.current = clampedDragY;

    if (pointerDismissFrame.current !== null) return;

    pointerDismissFrame.current = window.requestAnimationFrame(() => {
      setPointerDismissY(requestedPointerDismissY.current);
      pointerDismissFrame.current = null;
    });
  };

  const resetPointerDismiss = () => {
    if (pointerDismissFrame.current !== null) {
      window.cancelAnimationFrame(pointerDismissFrame.current);
      pointerDismissFrame.current = null;
    }
    pointerDismissYRef.current = 0;
    requestedPointerDismissY.current = 0;
    setPointerDismissY(0);
    setPointerDismissDragging(false);
  };

  const handleSheetWheel = (event: WheelEvent<HTMLElement>) => {
    const description = descriptionRef.current;
    if (!description) return;

    stopPointerInertia();

    const currentProgress = readingProgressRef.current;
    const shouldExpand = event.deltaY > 0 && currentProgress < 1;
    const shouldCollapse =
      event.deltaY < 0 &&
      currentProgress > 0 &&
      description.scrollTop <= 0;

    if (shouldExpand || shouldCollapse) {
      description.scrollTop = 0;
      updateReadingProgress(
        currentProgress + event.deltaY / DETAIL_READING_DISTANCE,
      );

      if (readingWheelTimer.current !== null) {
        window.clearTimeout(readingWheelTimer.current);
      }
      const direction = event.deltaY;
      readingWheelTimer.current = window.setTimeout(() => {
        settleReadingProgress(direction);
        readingWheelTimer.current = null;
      }, DETAIL_READING_WHEEL_SETTLE);
      return;
    }

    if (
      currentProgress >= 1 &&
      event.target instanceof Node &&
      !description.contains(event.target)
    ) {
      description.scrollTop += event.deltaY;
    }
  };

  const handleSheetTouchStart = (event: TouchEvent<HTMLElement>) => {
    stopPointerInertia();

    if (event.touches.length !== 1 || isDetailInteractiveTarget(event.target)) {
      detailTouchGesture.current = null;
      return;
    }

    const description = descriptionRef.current;
    if (!description) return;

    const progress = readingProgressRef.current;
    detailTouchGesture.current = {
      descriptionScrollTop: description.scrollTop,
      readingProgress: progress,
      startedInDescription:
        event.target instanceof Node && description.contains(event.target),
      startY: event.touches[0].clientY,
    };

    if (progress > 0) {
      event.stopPropagation();
    }
  };

  const handleSheetTouchMove = (event: TouchEvent<HTMLElement>) => {
    const gesture = detailTouchGesture.current;
    const description = descriptionRef.current;
    if (!gesture || !description || event.touches.length !== 1) return;

    const scrollDelta = gesture.startY - event.touches[0].clientY;

    if (gesture.readingProgress < 1) {
      if (gesture.readingProgress <= 0 && scrollDelta < 0) {
        return;
      }

      event.stopPropagation();
      description.scrollTop = 0;
      updateReadingProgress(
        gesture.readingProgress + scrollDelta / DETAIL_READING_DISTANCE,
      );
      return;
    }

    if (scrollDelta < 0 && gesture.descriptionScrollTop <= 0) {
      event.stopPropagation();
      description.scrollTop = 0;
      updateReadingProgress(1 + scrollDelta / DETAIL_READING_DISTANCE);
      return;
    }

    if (!gesture.startedInDescription) {
      event.stopPropagation();
      description.scrollTop = Math.max(
        0,
        gesture.descriptionScrollTop + scrollDelta,
      );
    }
  };

  const handleSheetTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const gesture = detailTouchGesture.current;
    if ((gesture?.readingProgress ?? 0) > 0) {
      event.stopPropagation();
    }

    if (gesture && readingProgressRef.current < 1) {
      const endY = event.changedTouches[0]?.clientY ?? gesture.startY;
      const scrollDelta = gesture.startY - endY;
      settleReadingProgress(Math.abs(scrollDelta) >= 12 ? scrollDelta : 0);
    }
    detailTouchGesture.current = null;
  };

  const handleSheetPointerDown = (event: PointerEvent<HTMLElement>) => {
    stopPointerInertia();

    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      isDetailInteractiveTarget(event.target)
    ) {
      detailPointerGesture.current = null;
      return;
    }

    const description = descriptionRef.current;
    if (!description) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    detailPointerGesture.current = {
      descriptionScrollTop: description.scrollTop,
      lastTimestamp: performance.now(),
      lastY: event.clientY,
      pointerId: event.pointerId,
      readingProgress: readingProgressRef.current,
      startedInDescription:
        event.target instanceof Node && description.contains(event.target),
      startY: event.clientY,
      velocity: 0,
    };
  };

  const handleSheetPointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = detailPointerGesture.current;
    const description = descriptionRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !description) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const timestamp = performance.now();
    const elapsed = Math.max(1, timestamp - gesture.lastTimestamp);
    const instantVelocity = (gesture.lastY - event.clientY) / elapsed;
    gesture.velocity = lerp(gesture.velocity, instantVelocity, 0.45);
    gesture.lastTimestamp = timestamp;
    gesture.lastY = event.clientY;
    const scrollDelta = gesture.startY - event.clientY;

    if (
      gesture.readingProgress <= 0 &&
      gesture.descriptionScrollTop <= 0 &&
      scrollDelta < 0
    ) {
      setPointerDismissDragging(true);
      updatePointerDismissY(-scrollDelta);
      return;
    }

    if (pointerDismissYRef.current > 0) {
      resetPointerDismiss();
    }

    if (gesture.readingProgress < 1) {
      description.scrollTop = 0;
      updateReadingProgress(
        gesture.readingProgress + scrollDelta / DETAIL_READING_DISTANCE,
      );
      return;
    }

    if (scrollDelta < 0 && gesture.descriptionScrollTop <= 0) {
      description.scrollTop = 0;
      updateReadingProgress(1 + scrollDelta / DETAIL_READING_DISTANCE);
      return;
    }

    description.scrollTop = Math.max(
      0,
      gesture.descriptionScrollTop + scrollDelta,
    );
  };

  const finishSheetPointerGesture = (
    event: PointerEvent<HTMLElement>,
    cancelled = false,
  ) => {
    const gesture = detailPointerGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    event.stopPropagation();
    const scrollDelta = gesture.startY - event.clientY;
    const currentProgress = readingProgressRef.current;
    const dismissDragY = pointerDismissYRef.current;

    if (dismissDragY > 0) {
      if (!cancelled && dismissDragY >= 64) {
        swipeBack.requestBack();
      }
      resetPointerDismiss();
    } else if (
      !cancelled &&
      gesture.readingProgress <= 0 &&
      currentProgress <= 0 &&
      scrollDelta <= -64
    ) {
      swipeBack.requestBack();
    } else if (currentProgress < 1) {
      settleReadingProgress(
        !cancelled && Math.abs(scrollDelta) >= 12 ? scrollDelta : 0,
      );
    } else if (!cancelled && gesture.readingProgress >= 1) {
      const idleDuration = Math.max(
        0,
        performance.now() - gesture.lastTimestamp,
      );
      const releaseVelocity =
        gesture.velocity *
        Math.pow(
          DETAIL_POINTER_INERTIA_FRICTION,
          idleDuration / (1000 / 60),
        );
      if (
        Math.abs(releaseVelocity) >=
        DETAIL_POINTER_INERTIA_MIN_VELOCITY
      ) {
        startPointerInertia(releaseVelocity);
      }
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    detailPointerGesture.current = null;
  };

  useLayoutEffect(() => {
    if (!historyActive) return;

    const currentState = getHistoryState();

    if (currentState[DETAIL_HISTORY_STATE_KEY] !== true) {
      window.history.pushState(
        {
          ...currentState,
          [DETAIL_HISTORY_STATE_KEY]: true,
        },
        "",
        window.location.href,
      );
    }

    ownsHistoryEntry.current = true;

    const closeFromHistory = (event: PopStateEvent) => {
      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false;
        return;
      }

      if (
        !ownsHistoryEntry.current ||
        getHistoryState(event.state)[DETAIL_HISTORY_STATE_KEY] === true
      ) {
        return;
      }

      closingFromHistory.current = true;
      void requestExitRef.current().then(() => {
        finishCloseRef.current();
      });
    };

    window.addEventListener("popstate", closeFromHistory);

    return () => {
      window.removeEventListener("popstate", closeFromHistory);
    };
  }, [historyActive]);

  const closeFromBackdrop = () => {
    swipeBack.requestBack();
  };

  return (
    <Frame {...(selectedPhoto ? {} : swipeBack.gestureProps)}>
      <Backdrop
        type="button"
        aria-label={backLabel}
        onClick={closeFromBackdrop}
        $revealProgress={revealProgress}
        $progress={Math.max(
          swipeBack.dragProgress,
          Math.min(pointerDismissY / 160, 1),
        )}
        $isDragging={swipeBack.isDragging || pointerDismissDragging}
      />
      <Sheet
        ref={sheetRef}
        data-scroll-region
        $revealProgress={revealProgress}
        $dragY={Math.max(swipeBack.dragY, pointerDismissY)}
        $isDragging={swipeBack.isDragging || pointerDismissDragging}
        $readingProgress={readingProgress}
        onPointerCancel={(event) => finishSheetPointerGesture(event, true)}
        onPointerDown={handleSheetPointerDown}
        onPointerMove={handleSheetPointerMove}
        onPointerUp={finishSheetPointerGesture}
        onTouchCancel={handleSheetTouchEnd}
        onTouchEnd={handleSheetTouchEnd}
        onTouchMove={handleSheetTouchMove}
        onTouchStart={handleSheetTouchStart}
        onWheel={handleSheetWheel}
      >
        <SheetHandle aria-hidden="true" />
        <HeroImage
          ref={heroRef}
          role="img"
          $image={place.image}
          $revealProgress={revealProgress}
          $layoutMetrics={layoutMetrics}
          $readingProgress={readingProgress}
          aria-label={`${place.name} 풍경`}
        />
        <Content
          $collapseDistance={layoutMetrics?.contentCollapseDistance ?? 0}
          $revealProgress={revealProgress}
          $readingProgress={readingProgress}
        >
          <Summary ref={summaryRef} $readingProgress={readingProgress}>
            <TopLine>
              <LocationLabel>
                <TutiPlaceIcon $size="small" aria-hidden="true" />
                <span>{locationLabel ?? "오늘 고른 공간"}</span>
              </LocationLabel>
              <ContextMenu
                label={`${place.name} 메뉴`}
                items={[
                  ...(onToggleSavedForLater
                    ? [
                        {
                          label: savedForLater
                            ? "다음에 갈 공간에서 빼기"
                            : "다음에 갈 공간에 추가",
                          onSelect: onToggleSavedForLater,
                        },
                      ]
                    : []),
                  {
                    label: "장소 공유하기",
                    onSelect: () => setShareOpen(true),
                  },
                  ...(showBackMenuItem
                    ? [
                        {
                          label: backLabel,
                          onSelect: closeFromBackdrop,
                        },
                      ]
                    : []),
                ]}
              />
            </TopLine>

            <Heading $readingProgress={readingProgress}>
              <h1>{place.name}</h1>
              {subtitle && <p>{subtitle}</p>}
            </Heading>

            <Tags aria-label="장소 정보">
              <Tag $tone="brand">{travelTimeLabel}</Tag>
              {crowdBadge && <Tag $tone="secondary">{crowdBadge}</Tag>}
              {weatherBadge && <Tag $tone="secondary">{weatherBadge}</Tag>}
              {operationBadge && <Tag $tone="neutral">{operationBadge}</Tag>}
            </Tags>
          </Summary>

          <Description
            ref={descriptionRef}
            $readingProgress={readingProgress}
          >
            <ReasonCard>
              <small>오늘 이곳을 고른 이유</small>
              <strong>{getPlaceReasonHeadline(place)}</strong>
              <p>{createBurdenCopy(place)}</p>
            </ReasonCard>

            <Section>
              <SectionTitle>어떤 곳인가요?</SectionTitle>
              <Overview>{overviewSummary}</Overview>
              {canShowRawOverview && (
                <OriginalDisclosure>
                  <OriginalToggle
                    type="button"
                    aria-controls={overviewRegionId}
                    aria-expanded={rawOverviewExpanded}
                    $expanded={rawOverviewExpanded}
                    onClick={() =>
                      setExpandedOverviewPlaceId((expandedPlaceId) =>
                        expandedPlaceId === place.id ? null : place.id,
                      )
                    }
                  >
                    {rawOverviewExpanded ? "원문 접기" : "원문 보기"}
                    <ChevronDown aria-hidden="true" />
                  </OriginalToggle>
                  {rawOverviewExpanded && (
                    <OriginalOverview id={overviewRegionId}>
                      {rawOverview}
                    </OriginalOverview>
                  )}
                </OriginalDisclosure>
              )}
              {detailQuery.isError && (
                <InlineRetry
                  type="button"
                  onClick={() => void detailQuery.refetch()}
                >
                  상세정보 다시 불러오기
                </InlineRetry>
              )}
            </Section>

            {facts.length > 0 && (
              <Section>
                <SectionTitle>이 정도만 알고 가세요.</SectionTitle>
                <FactGrid>
                  {facts.map((fact) => {
                    const Icon = getVisitInformationIcon(fact.key);
                    return (
                      <FactCard
                        key={fact.label}
                        title={fact.value}
                        $needsVerification={fact.needsVerification}
                      >
                        <Icon aria-hidden="true" />
                        <span>{fact.label}</span>
                        {fact.needsVerification && <em>확인 필요</em>}
                        <strong>{fact.value}</strong>
                      </FactCard>
                    );
                  })}
                </FactGrid>
              </Section>
            )}

            {detail && detail.images.length > 0 && (
              <Section>
                <SectionTitle>미리 보는 풍경</SectionTitle>
                <PhotoPreviewStrip
                  images={detail.images.slice(0, 4)}
                  placeName={place.name}
                  onSelect={setSelectedPhoto}
                />
              </Section>
            )}

            <DataNotice>
              {hasUncertainVisitInformation && (
                <>
                  <strong>비용·운영 정보 확인 필요</strong>
                  <span>
                    확인 필요로 표시된 항목은 방문 전에 장소의 공식 안내를
                    확인해주세요.
                  </span>
                </>
              )}
              {place.crowdForecast ? (
                <>
                  <strong>
                    {getCrowdForecastBasisLabel(place.crowdForecast)}
                  </strong>
                  <span>{getCrowdForecastDescription(place.crowdForecast)}</span>
                </>
              ) : (
                <span>현장 상황은 시간과 날씨에 따라 달라질 수 있어요.</span>
              )}
              {place.weatherForecast && (
                <>
                  <strong>기상청 단기예보</strong>
                  <span>
                    도착 예상 시각의 강수·기온·바람을 반영했어요. 실제
                    날씨는 달라질 수 있어요.
                  </span>
                </>
              )}
              {detail?.isStale && (
                <span>
                  비용·운영 정보는 최근 저장된 내용이며 지금과 다를 수
                  있어요.
                </span>
              )}
            </DataNotice>

            <SourceAttribution>
              <span>장소·사진 정보 출처</span>
              <strong>ⓒ한국관광공사</strong>
              <p>운영 정보와 현장 상황은 달라질 수 있어요.</p>
            </SourceAttribution>
          </Description>
        </Content>
      </Sheet>
      {selectedPhoto && (
        <PhotoViewer
          photo={selectedPhoto}
          placeName={place.name}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
      {shareOpen && (
        <PlaceShareDialog
          place={place}
          onClose={() => setShareOpen(false)}
        />
      )}
    </Frame>
  );
}

function PhotoPreviewStrip({
  images,
  placeName,
  onSelect,
}: {
  images: TourismPlaceDetailImage[];
  placeName: string;
  onSelect: (image: TourismPlaceDetailImage) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(images.length > 2);

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setCanScrollLeft(rail.scrollLeft > 2);
    setCanScrollRight(rail.scrollLeft < maxScrollLeft - 2);
  }, []);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const frame = window.requestAnimationFrame(updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(rail);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [images.length, updateScrollState]);

  const scrollPhotos = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: direction * Math.max(120, rail.clientWidth * 0.72),
      behavior: "smooth",
    });
  };

  return (
    <PhotoStripFrame
      data-swipe-back-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <PhotoRail
        ref={railRef}
        aria-label={`${placeName} 추가 사진`}
        onScroll={updateScrollState}
      >
        {images.map((image, index) => (
          <Photo
            key={`${image.url}-${index}`}
            type="button"
            aria-haspopup="dialog"
            aria-label={image.title ?? `${placeName} 사진 ${index + 1}`}
            $image={image.thumbnailUrl ?? image.url}
            onClick={() => onSelect(image)}
          />
        ))}
      </PhotoRail>
      {canScrollLeft && (
        <PhotoRailControl
          type="button"
          aria-label="이전 사진 보기"
          $side="left"
          onClick={() => scrollPhotos(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </PhotoRailControl>
      )}
      {canScrollRight && (
        <PhotoRailControl
          type="button"
          aria-label="다음 사진 보기"
          $side="right"
          onClick={() => scrollPhotos(1)}
        >
          <ChevronRight aria-hidden="true" />
        </PhotoRailControl>
      )}
    </PhotoStripFrame>
  );
}

function PhotoViewer({
  photo,
  placeName,
  onClose,
}: {
  photo: TourismPlaceDetailImage;
  placeName: string;
  onClose: () => void;
}) {
  const ready = useDeferredAnimationStart();
  const [closing, setClosing] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [panX, setPanX] = useState(0);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const photoDragRef = useRef<{
    pointerId: number;
    startX: number;
    startPanX: number;
    maxPanX: number;
    moved: boolean;
  } | null>(null);
  const suppressPhotoClickRef = useRef(false);
  const visible = ready && !closing;
  const requestClose = useCallback(() => {
    if (closingRef.current) return;

    closingRef.current = true;
    setClosing(true);
    const closeDelay = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : PHOTO_VIEWER_DURATION;
    closeTimerRef.current = window.setTimeout(onClose, closeDelay);
  }, [onClose]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, [requestClose]);

  const startPhotoDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!zoomed || event.button !== 0) return;

    const width = event.currentTarget.getBoundingClientRect().width;
    photoDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startPanX: panX,
      maxPanX: (width * (PHOTO_VIEWER_ZOOM - 1)) / 2,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const updatePhotoDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = photoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.stopPropagation();
    event.preventDefault();
    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) >= PHOTO_DRAG_THRESHOLD) drag.moved = true;
    setPanX(clamp(drag.startPanX + deltaX, -drag.maxPanX, drag.maxPanX));
  };

  const finishPhotoDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = photoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    suppressPhotoClickRef.current = drag.moved;
    window.setTimeout(() => {
      suppressPhotoClickRef.current = false;
    }, 0);
    photoDragRef.current = null;
    setDragging(false);
  };

  return (
    <PhotoViewerBackdrop
      data-swipe-back-ignore
      role="dialog"
      aria-modal="true"
      aria-label={`${placeName} 사진 크게 보기`}
      $visible={visible}
      onClick={requestClose}
    >
      <ExpandedPhoto
        type="button"
        autoFocus
        aria-label={zoomed ? "사진 원래 크기로 보기" : "사진 더 크게 보기"}
        aria-pressed={zoomed}
        $visible={visible}
        $zoomed={zoomed}
        $dragging={dragging}
        $panX={panX}
        $previewImage={photo.thumbnailUrl ?? photo.url}
        onPointerDown={startPhotoDrag}
        onPointerMove={updatePhotoDrag}
        onPointerUp={finishPhotoDrag}
        onPointerCancel={finishPhotoDrag}
        onClick={(event) => {
          event.stopPropagation();
          if (suppressPhotoClickRef.current) {
            suppressPhotoClickRef.current = false;
            return;
          }
          if (zoomed) setPanX(0);
          setZoomed((current) => !current);
        }}
      >
        {/* 원본 비율을 유지하는 외부 관광 이미지를 그대로 확대합니다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.title ?? `${placeName} 풍경`}
          draggable="false"
        />
      </ExpandedPhoto>
      <PhotoViewerHint $visible={visible}>
        {zoomed
          ? "좌우로 끌어 살펴보세요. 사진을 누르면 원래 크기로 돌아가요."
          : "사진을 누르면 더 크게 볼 수 있어요. 바깥을 누르면 닫혀요."}
      </PhotoViewerHint>
    </PhotoViewerBackdrop>
  );
}

function getVisitInformationIcon(key: VisitInformationFact["key"]) {
  if (key === "restDate") return CalendarDays;
  if (key === "admissionFee") return Ticket;
  if (key === "parking") return Car;
  return Clock3;
}

function createCrowdBadge(place: TutiPlace) {
  if (place.crowdForecast) {
    return `${getCrowdForecastKindLabel(place.crowdForecast)} · ${getCrowdForecastLevelLabel(place.crowdForecast)}`;
  }

  const value = place.crowd.trim();
  return value && value !== "정보 없음" ? `혼잡도 · ${value}` : null;
}

function getCrowdForecastDescription(
  forecast: NonNullable<TutiPlace["crowdForecast"]>,
) {
  if (forecast.provider === "seoul_citydata") {
    return "서울시 실시간 인구 추정치를 바탕으로 하며 실제 현장과 다를 수 있어요.";
  }
  if (forecast.provider === "regional_visitors") {
    return "지역 방문 패턴을 바탕으로 한 평시 예상값이에요.";
  }
  if (forecast.provider === "tuti_estimate") {
    return "지역 방문량과 장소 수요를 함께 살펴 계산한 예상값이에요.";
  }
  return "한국관광공사의 방문 패턴을 바탕으로 한 예상값이며 실제 현장과 다를 수 있어요.";
}

function createPlaceSubtitle(place: TutiPlace) {
  const phrase = getPlaceDisplayPhrase(place);
  if (phrase === place.reason?.trim()) return null;
  return phrase;
}

function getFallbackDescription(place: TutiPlace) {
  if (
    /노출 전 상세 내용을 확인|TourAPI에서 가져온 장소/.test(place.note)
  ) {
    return `${place.name}에서 오늘 필요한 만큼만 천천히 머물러 보세요. 자세한 운영 정보는 확인되는 대로 덧붙여드릴게요.`;
  }

  return place.note;
}

function createBurdenCopy(place: TutiPlace) {
  if (place.reasonDetail) return place.reasonDetail;

  if (place.movementLevel === "near") {
    return "멀리 준비하지 않아도 닿을 수 있는 쪽으로 골랐어요.";
  }
  if (place.movementLevel === "half") {
    return "조금 여유를 내어 천천히 다녀오기 좋은 선택이에요.";
  }
  return "오늘 가능한 정도 안에서 가볍게 다녀올 수 있어요.";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function isDetailInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("button, a, input, textarea, select"))
  );
}

function getHistoryState(state: unknown = window.history.state) {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
}

const Frame = styled.section`
  position: absolute;
  inset: 0;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
`;

const Backdrop = styled(BaseButton)<{
  $revealProgress: number;
  $progress: number;
  $isDragging: boolean;
}>`
  position: absolute;
  inset: 0;
  width: 100%;
  padding: 0;
  background: rgb(var(--color-black-rgb) / 0.28);
  opacity: ${({ $revealProgress, $progress }) =>
    $revealProgress * (1 - $progress)};
  transition: ${({ $isDragging, $revealProgress }) =>
    $isDragging || $revealProgress < 1
      ? "none"
      : `opacity ${DETAIL_EXIT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};
`;

const Sheet = styled.article<{
  $revealProgress: number;
  $dragY: number;
  $isDragging: boolean;
  $readingProgress: number;
}>`
  --detail-hero-width: ${fluidByViewportHeight(128, 160)};
  --detail-hero-height: ${fluidByViewportHeight(213, 267)};
  --detail-content-start: ${fluidByViewportHeight(132, 172)};

  position: absolute;
  top: ${({ $readingProgress }) =>
    `max(${(1 - $readingProgress) * 20}%, calc(var(--app-safe-area-top, 0px) + var(--space-2)))`};
  right: 0;
  bottom: 0;
  left: 0;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--detail-content-start) var(--space-5)
    calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
  border-radius: ${({ $readingProgress }) =>
    `${lerp(32, 26, $readingProgress)}px ${lerp(32, 26, $readingProgress)}px 0 0`};
  background: var(--color-surface);
  box-shadow: 0 -${({ $readingProgress }) => lerp(12, 4, $readingProgress)}px
    ${({ $readingProgress }) => lerp(44, 24, $readingProgress)}px
    rgb(var(--color-black-rgb) / 0.1);
  opacity: ${({ $revealProgress }) => $revealProgress};
  transform: translateY(
    ${({ $dragY, $revealProgress }) =>
      Math.max($dragY, 0) + (1 - $revealProgress) * 100}px
  );
  transition: ${({ $isDragging, $revealProgress }) =>
    $isDragging || $revealProgress < 1
      ? "none"
      : `transform ${DETAIL_EXIT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};

  @supports (corner-shape: squircle) {
    border-radius: ${({ $readingProgress }) =>
      `${lerp(44, 36, $readingProgress)}px ${lerp(44, 36, $readingProgress)}px 0 0`};
    corner-shape: squircle;
  }

  @media (pointer: fine) {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }

    button,
    a,
    select {
      cursor: pointer;
    }

    input,
    textarea {
      cursor: text;
    }
  }
`;

const SheetHandle = styled.div`
  position: absolute;
  top: var(--space-3);
  left: 50%;
  z-index: 4;
  width: var(--space-9);
  height: 4px;
  border-radius: 999px;
  background: var(--color-neutral-400);
  transform: translateX(-50%);
`;

const HeroImage = styled.div<{
  $image: string;
  $revealProgress: number;
  $layoutMetrics: DetailLayoutMetrics | null;
  $readingProgress: number;
}>`
  position: absolute;
  z-index: 5;
  top: ${({ $layoutMetrics, $readingProgress }) =>
    $layoutMetrics
      ? `${lerp($layoutMetrics.heroTop, 28, $readingProgress)}px`
      : fluidByViewportHeight(-92, -112)};
  left: ${({ $layoutMetrics, $readingProgress }) =>
    $layoutMetrics
      ? `${lerp($layoutMetrics.heroLeft, 20, $readingProgress)}px`
      : "50%"};
  width: ${({ $layoutMetrics, $readingProgress }) =>
    $layoutMetrics
      ? `${lerp($layoutMetrics.heroWidth, 64, $readingProgress)}px`
      : "var(--detail-hero-width)"};
  height: ${({ $layoutMetrics, $readingProgress }) =>
    $layoutMetrics
      ? `${lerp($layoutMetrics.heroHeight, 64, $readingProgress)}px`
      : "var(--detail-hero-height)"};
  border-radius: ${({ $readingProgress }) =>
    lerp(22, 16, $readingProgress)}px;
  background-color: var(--color-accent-soft);
  background-image:
    linear-gradient(
      180deg,
      rgb(var(--color-black-rgb) / 0.02),
      rgb(var(--color-black-rgb) / 0.12)
    ),
    ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  box-shadow: 0 ${({ $readingProgress }) => lerp(14, 6, $readingProgress)}px
    ${({ $readingProgress }) => lerp(30, 18, $readingProgress)}px
    rgb(
      var(--color-black-rgb) /
        ${({ $readingProgress }) => lerp(0.24, 0.14, $readingProgress)}
    );
  opacity: ${({ $revealProgress }) =>
    Math.max(0, Math.min(($revealProgress - 0.58) / 0.3, 1))};
  transform: ${({ $layoutMetrics }) =>
    $layoutMetrics ? "none" : "translateX(-50%)"};
  will-change: top, left, width, height, transform;
`;

const Content = styled.div<{
  $collapseDistance: number;
  $revealProgress: number;
  $readingProgress: number;
}>`
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${({ $readingProgress }) => lerp(16, 12, $readingProgress)}px;
  margin-top: -${({ $collapseDistance, $readingProgress }) =>
    $collapseDistance * $readingProgress}px;
  opacity: ${({ $revealProgress }) =>
    Math.max(0, Math.min(($revealProgress - 0.68) / 0.32, 1))};
  transform: translateY(
    ${({ $revealProgress }) =>
      (1 - Math.max(0, Math.min(($revealProgress - 0.68) / 0.32, 1))) * 12}px
  );
`;

const Summary = styled.div<{ $readingProgress: number }>`
  min-width: 0;
  display: grid;
  gap: ${({ $readingProgress }) => lerp(16, 2, $readingProgress)}px;
  padding-left: ${({ $readingProgress }) =>
    lerp(0, 76, $readingProgress)}px;
`;

const TopLine = styled.div`
  min-height: var(--space-8);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
`;

const LocationLabel = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Tags = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-block: 2px;
  overflow: hidden;
`;

const Tag = styled.span<{ $tone: "brand" | "neutral" | "secondary" }>`
  min-width: 0;
  min-height: var(--space-7);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 2px var(--space-2);
  overflow: hidden;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-300)"
      : $tone === "secondary"
        ? "var(--color-secondary-300)"
        : "var(--color-neutral-300)"};
  color: var(--color-text);
  font-size: var(--font-size-100);
  font-weight: 400;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Heading = styled.header<{ $readingProgress: number }>`
  display: grid;
  gap: ${({ $readingProgress }) => lerp(4, 0, $readingProgress)}px;

  h1 {
    min-width: 0;
    font-size: calc(
      var(--font-size-600) -
        ${({ $readingProgress }) => $readingProgress * 4}px
    );
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
  }

  p {
    display: -webkit-box;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }

`;

const Description = styled.div<{ $readingProgress: number }>`
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-8);
  padding: ${({ $readingProgress }) => lerp(16, 20, $readingProgress)}px 1px
    var(--space-5);
  border-top: 1px solid
    rgb(
      var(--color-black-rgb) /
        ${({ $readingProgress }) => $readingProgress * 0.06}
    );
  overflow-y: ${({ $readingProgress }) =>
    $readingProgress >= 1 ? "auto" : "hidden"};
  overscroll-behavior-y: contain;
  touch-action: ${({ $readingProgress }) =>
    $readingProgress >= 1 ? "pan-y" : "none"};

  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

`;

const ReasonCard = styled.section`
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-secondary-300);
  border-radius: 20px;
  background: linear-gradient(
    145deg,
    var(--color-secondary-100),
    var(--color-secondary-200)
  );

  > small {
    color: var(--color-secondary-900);
    font-size: var(--font-size-100);
    font-weight: 600;
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
  }

  > strong {
    font-size: var(--font-size-300);
    font-weight: 650;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  > p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
  }
`;

const Section = styled.section`
  width: 100%;
  min-width: 0;
  display: grid;
  gap: var(--space-4);
`;

const SectionTitle = styled.h2`
  font-size: var(--font-size-300);
  font-weight: 650;
  line-height: var(--line-height-subtitle);
  letter-spacing: var(--letter-spacing-subtitle);
`;

const Overview = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
  white-space: pre-line;
`;

const OriginalDisclosure = styled.div`
  display: grid;
  justify-items: start;
  gap: var(--space-3);
`;

const OriginalToggle = styled(BaseButton)<{ $expanded: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  font-weight: 550;
  line-height: 1.2;

  svg {
    width: 14px;
    height: 14px;
    transform: rotate(${({ $expanded }) => ($expanded ? 180 : 0)}deg);
    transition: transform 180ms ease;
  }

  &:hover {
    color: var(--color-text);
  }
`;

const OriginalOverview = styled.p`
  padding-left: var(--space-3);
  border-left: 2px solid var(--color-brand-300);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
  white-space: pre-line;
  animation: reveal-original-overview 180ms ease-out both;

  @keyframes reveal-original-overview {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    & {
      animation: none;
    }
  }
`;

const InlineRetry = styled(BaseButton)`
  justify-self: start;
  padding: 0;
  color: var(--color-brand-800);
  background: transparent;
  font-size: var(--font-size-100);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
`;

const FactGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
`;

const FactCard = styled.div<{ $needsVerification: boolean }>`
  min-width: 0;
  min-height: 92px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-content: start;
  gap: var(--space-1) var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-neutral-300);
  border-radius: 16px;
  background: ${({ $needsVerification }) =>
    $needsVerification
      ? "var(--color-secondary-100)"
      : "var(--color-neutral-200)"};

  svg {
    width: var(--space-4);
    height: var(--space-4);
    color: var(--color-brand-700);
    stroke-width: 2;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }

  em {
    align-self: start;
    padding: 1px var(--space-2);
    border-radius: 999px;
    background: var(--color-secondary-300);
    color: var(--color-secondary-1000);
    font-size: calc(var(--font-size-100) - 2px);
    font-style: normal;
    font-weight: 650;
    line-height: var(--line-height-body);
    white-space: nowrap;
  }

  strong {
    grid-column: 1 / -1;
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-text);
    font-size: var(--font-size-100);
    font-weight: 600;
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }
`;

const PhotoStripFrame = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
`;

const PhotoRail = styled.div`
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(112px, 42%);
  gap: var(--space-2);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const PhotoRailControl = styled(BaseButton)<{ $side: "left" | "right" }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => $side}: var(--space-2);
  z-index: 1;
  width: var(--space-8);
  height: var(--space-8);
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgb(var(--color-black-rgb) / 0.1);
  border-radius: 50%;
  background: rgb(var(--color-white-rgb) / 0.9);
  color: var(--color-neutral-1100);
  box-shadow: 0 4px 16px rgb(var(--color-black-rgb) / 0.18);
  transform: translateY(-50%);

  svg {
    width: var(--space-5);
    height: var(--space-5);
    stroke-width: 2;
  }

  &:hover {
    background: var(--color-white);
  }

  &:focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: 2px;
  }
`;

const Photo = styled(BaseButton)<{ $image: string }>`
  width: 100%;
  aspect-ratio: 4 / 3;
  padding: 0;
  overflow: hidden;
  border-radius: 16px;
  background-color: var(--color-neutral-200);
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  cursor: zoom-in;
`;

const PhotoViewerBackdrop = styled.div<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  overflow: hidden;
  background: rgb(var(--color-black-rgb) / 0.76);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 440ms cubic-bezier(0.22, 1, 0.36, 1);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;
  }
`;

const ExpandedPhoto = styled(BaseButton)<{
  $visible: boolean;
  $zoomed: boolean;
  $dragging: boolean;
  $panX: number;
  $previewImage: string;
}>`
  width: 100%;
  max-width: 360px;
  max-height: 78%;
  display: grid;
  place-items: center;
  padding: 0;
  background: transparent;
  cursor: ${({ $zoomed, $dragging }) =>
    $dragging ? "grabbing" : $zoomed ? "grab" : "zoom-in"};
  opacity: ${({ $visible }) => ($visible ? 1 : 0.72)};
  transform: translate3d(
      ${({ $visible, $panX }) => ($visible ? $panX : 0)}px,
      0,
      0
    )
    scale(
      ${({ $visible, $zoomed }) =>
        $visible ? ($zoomed ? PHOTO_VIEWER_ZOOM : 1) : 0.68}
    );
  transition: ${({ $dragging }) =>
    $dragging
      ? "none"
      : `opacity ${PHOTO_VIEWER_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${PHOTO_VIEWER_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};
  touch-action: none;

  img {
    display: block;
    width: 100%;
    min-height: 220px;
    max-height: min(72vh, 680px);
    border-radius: 24px;
    background-image: ${({ $previewImage }) => `url(${$previewImage})`};
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
    object-fit: contain;
    box-shadow: 0 24px 64px rgb(var(--color-black-rgb) / 0.38);
    pointer-events: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: var(--space-2);
    border-radius: 24px;
  }

  @media (prefers-reduced-motion: reduce) {
    transform: none;
    transition-duration: 1ms;
  }
`;

const PhotoViewerHint = styled.p<{ $visible: boolean }>`
  position: absolute;
  right: var(--space-4);
  bottom: calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
  left: var(--space-4);
  color: var(--color-white);
  font-size: var(--font-size-100);
  font-weight: 400;
  line-height: var(--line-height-body);
  text-align: center;
  opacity: ${({ $visible }) => ($visible ? 0.82 : 0)};
  transform: translateY(${({ $visible }) => ($visible ? 0 : 8)}px);
  transition:
    opacity 420ms ease,
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1);

  @media (prefers-reduced-motion: reduce) {
    transform: none;
  }
`;

const DataNotice = styled.aside`
  display: grid;
  gap: 2px;
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--color-brand-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);

  strong {
    color: var(--color-brand-900);
    font-weight: 600;
  }
`;

const SourceAttribution = styled.footer`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px var(--space-2);
  padding: 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);

  span {
    color: var(--color-neutral-800);
  }

  strong {
    color: var(--color-text-muted);
    font-weight: 600;
  }

  p {
    flex-basis: 100%;
    color: var(--color-neutral-700);
  }
`;
