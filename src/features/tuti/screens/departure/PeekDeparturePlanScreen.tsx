"use client";

import styled from "@emotion/styled";
import { ChevronUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { useDeparturePlan } from "@/features/tuti/hooks/useDeparturePlan";
import { DeparturePlanScreen } from "@/features/tuti/screens/departure/DeparturePlanScreen";
import type { TutiPlace } from "@/lib/recommendations";
import type {
  DeparturePlan,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";
import { useTutiStore } from "@/store/tuti";

const PEEK_HEIGHT = 208;
const SNAP_DURATION = 460;
const CLOSE_DURATION = 420;
const DRAG_THRESHOLD = 72;
const DEPARTURE_PEEK_HISTORY_KEY = "__tutiDeparturePeek";
const ROUTE_MODE_PRIORITY: DepartureRouteMode[] = [
  "walking",
  "publicTransit",
  "driving",
  "bicycle",
];

type DragState = {
  pointerId: number;
  startY: number;
  startTranslate: number;
  maxTranslate: number;
};

export function PeekDeparturePlanScreen({
  place,
  onClose,
}: {
  place: TutiPlace;
  onClose: () => void;
}) {
  const storedUserLocation = useTutiStore((state) => state.userLocation);
  const [departureLocation, setDepartureLocation] =
    useState<UserLocation>();
  const userLocation = departureLocation ?? storedUserLocation;
  const animationReady = useDeferredAnimationStart();
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);
  const [maxTranslate, setMaxTranslate] = useState(0);
  const [contentMounted, setContentMounted] = useState(false);
  const [contentInteractive, setContentInteractive] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | "error"
  >(userLocation ? "idle" : "loading");
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const movedDuringDrag = useRef(false);
  const suppressNextClick = useRef(false);
  const closingRef = useRef(false);
  const ownsHistoryEntry = useRef(false);
  const ignoreNextPopState = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const interactionTimer = useRef<number | null>(null);
  const locationRequest = useRef<Promise<UserLocation> | null>(null);
  const departureQuery = useDeparturePlan(place.id, userLocation);
  const progress = Math.max(
    0,
    Math.min(
      1,
      dragTranslate === null || maxTranslate <= 0
        ? expanded
          ? 1
          : 0
        : 1 - dragTranslate / maxTranslate,
    ),
  );
  const contentOpacity = Math.max(0, Math.min(1, (progress - 0.18) / 0.58));
  const travelTimeLabel = resolveTravelTimeLabel({
    userLocation,
    locationStatus,
    plan: departureQuery.data,
    isPending: departureQuery.isPending,
    isError: departureQuery.isError,
  });

  const requestClose = useCallback(
    (removeHistoryEntry: boolean) => {
      if (closingRef.current) return;

      closingRef.current = true;
      setContentInteractive(false);
      setClosing(true);
      setDragTranslate(null);
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        const shouldRemoveHistoryEntry =
          removeHistoryEntry && ownsHistoryEntry.current;

        ownsHistoryEntry.current = false;
        onClose();

        if (shouldRemoveHistoryEntry) {
          ignoreNextPopState.current = true;
          window.history.back();
        }
      }, CLOSE_DURATION);
    },
    [onClose],
  );

  const expandSheet = useCallback(() => {
    if (closingRef.current) return;

    if (interactionTimer.current) {
      window.clearTimeout(interactionTimer.current);
    }

    setContentMounted(true);
    setExpanded(true);
    interactionTimer.current = window.setTimeout(() => {
      interactionTimer.current = null;
      setContentInteractive(true);
    }, SNAP_DURATION - 80);
  }, []);

  const collapseSheet = useCallback(() => {
    if (closingRef.current) return;

    if (interactionTimer.current) {
      window.clearTimeout(interactionTimer.current);
      interactionTimer.current = null;
    }

    setContentInteractive(false);
    setExpanded(false);
  }, []);

  useLayoutEffect(() => {
    const currentState = getHistoryState();

    if (currentState[DEPARTURE_PEEK_HISTORY_KEY] !== true) {
      window.history.pushState(
        {
          ...currentState,
          [DEPARTURE_PEEK_HISTORY_KEY]: true,
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
        getHistoryState(event.state)[DEPARTURE_PEEK_HISTORY_KEY] === true
      ) {
        return;
      }

      ownsHistoryEntry.current = false;
      requestClose(false);
    };

    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, [requestClose]);

  useEffect(() => {
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose(true);
    };

    window.addEventListener("keydown", closeFromEscape);
    return () => window.removeEventListener("keydown", closeFromEscape);
  }, [requestClose]);

  useEffect(() => {
    if (userLocation) return;

    let active = true;
    const request =
      locationRequest.current ?? requestCurrentLocation();
    locationRequest.current = request;

    void request.then(
      (location) => {
        if (!active) return;
        setDepartureLocation(location);
        setLocationStatus("idle");
      },
      () => {
        if (!active) return;
        setLocationStatus("error");
      },
    );

    return () => {
      active = false;
    };
  }, [userLocation]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      if (interactionTimer.current) {
        window.clearTimeout(interactionTimer.current);
      }
    },
    [],
  );

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (
      closingRef.current ||
      !(event.target as HTMLElement).closest("[data-sheet-drag-region]")
    ) {
      return;
    }

    const sheet = sheetRef.current;
    if (!sheet) return;

    const nextMaxTranslate = Math.max(
      0,
      sheet.getBoundingClientRect().height - PEEK_HEIGHT,
    );
    const startTranslate = expanded ? 0 : nextMaxTranslate;

    setMaxTranslate(nextMaxTranslate);
    setDragTranslate(startTranslate);
    setContentInteractive(false);
    dragState.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTranslate,
      maxTranslate: nextMaxTranslate,
    };
    movedDuringDrag.current = false;
    suppressNextClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    const nextTranslate = Math.max(
      0,
      Math.min(drag.maxTranslate + 96, drag.startTranslate + deltaY),
    );

    if (Math.abs(deltaY) > 5) movedDuringDrag.current = true;
    if (deltaY < -8) setContentMounted(true);
    setDragTranslate(nextTranslate);
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    const wasExpanded = drag.startTranslate === 0;
    const shouldExpand = wasExpanded
      ? deltaY < DRAG_THRESHOLD
      : deltaY < -DRAG_THRESHOLD;

    dragState.current = null;
    suppressNextClick.current = movedDuringDrag.current;
    setDragTranslate(null);

    if (!wasExpanded && deltaY > DRAG_THRESHOLD) {
      requestClose(true);
      return;
    }

    if (shouldExpand) {
      expandSheet();
    } else {
      collapseSheet();
    }
  };

  const cancelDrag = () => {
    dragState.current = null;
    suppressNextClick.current = movedDuringDrag.current;
    setDragTranslate(null);

    if (expanded) {
      expandSheet();
    } else {
      collapseSheet();
    }
  };

  const toggleFromClick = () => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }

    if (expanded) {
      collapseSheet();
    } else {
      expandSheet();
    }
  };

  return (
    <Frame
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 출발 준비`}
    >
      <Backdrop
        type="button"
        aria-label="출발 준비 닫기"
        $progress={progress}
        $visible={animationReady && !closing}
        onClick={() => requestClose(true)}
      />
      <Sheet
        ref={sheetRef}
        $presented={animationReady}
        $expanded={expanded}
        $closing={closing}
        $dragTranslate={dragTranslate}
        onPointerDown={startDrag}
        onPointerMove={updateDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
      >
        <HandleButton
          type="button"
          data-sheet-drag-region
          aria-label={expanded ? "출발 준비 접기" : "출발 준비 펼치기"}
          onClick={toggleFromClick}
        >
          <i aria-hidden="true" />
        </HandleButton>

        <PreviewButton
          type="button"
          data-sheet-drag-region
          $progress={progress}
          aria-hidden={expanded}
          tabIndex={expanded ? -1 : 0}
          onClick={toggleFromClick}
        >
          <PreviewImage $image={place.image} aria-hidden="true" />
          <PreviewCopy>
            <small>출발 준비</small>
            <strong>{place.name}</strong>
            <PreviewMeta>
              <TravelBadge aria-live="polite">
                {travelTimeLabel}
              </TravelBadge>
              <PreviewPhrase>{place.phrase}</PreviewPhrase>
            </PreviewMeta>
            <GestureHint>
              위로 올려 출발 준비하기
              <ChevronUp aria-hidden="true" />
            </GestureHint>
          </PreviewCopy>
        </PreviewButton>

        <ContentLayer
          data-departure-content
          $opacity={contentOpacity}
          $interactive={
            contentInteractive && dragTranslate === null && !closing
          }
          aria-hidden={!contentInteractive}
          inert={!contentInteractive}
        >
          {contentMounted && (
            <DeparturePlanScreen
              place={place}
              embedded
              respectEmbeddedTopSafeArea={false}
              origin={userLocation}
              onOriginChange={setDepartureLocation}
              onClose={() => requestClose(true)}
            />
          )}
        </ContentLayer>
      </Sheet>
    </Frame>
  );
}

function getHistoryState(state: unknown = window.history.state) {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
}

function requestCurrentLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation_not_supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      reject,
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 10,
        timeout: 6000,
      },
    );
  });
}

function resolveTravelTimeLabel({
  userLocation,
  locationStatus,
  plan,
  isPending,
  isError,
}: {
  userLocation?: UserLocation;
  locationStatus: "idle" | "loading" | "error";
  plan?: DeparturePlan;
  isPending: boolean;
  isError: boolean;
}) {
  if (!userLocation) {
    return locationStatus === "loading"
      ? "위치 확인 중"
      : "현재 위치 확인 필요";
  }
  if (isPending) return "이동 시간 계산 중";
  if (isError || !plan) return "이동 시간 확인 필요";

  const mode =
    plan.recommendedMode ??
    ROUTE_MODE_PRIORITY.find(
      (routeMode) => plan.routes[routeMode].status === "available",
    );
  const durationSeconds = mode
    ? plan.routes[mode].durationSeconds
    : null;

  return durationSeconds === null
    ? "이동 시간 확인 필요"
    : formatDuration(durationSeconds);
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `약 ${minutes}분`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `약 ${hours}시간 ${remainder}분` : `약 ${hours}시간`;
}

const Frame = styled.section`
  position: absolute;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  touch-action: pan-y;
`;

const Backdrop = styled(BaseButton)<{
  $progress: number;
  $visible: boolean;
}>`
  position: absolute;
  inset: 0;
  width: 100%;
  padding: 0;
  background: rgb(
    var(--color-black-rgb) /
      ${({ $progress }) => 0.06 + Math.max(0, $progress) * 0.16}
  );
  backdrop-filter: blur(${({ $progress }) => 2 + Math.max(0, $progress) * 5}px);
  -webkit-backdrop-filter: blur(${({ $progress }) => 2 + Math.max(0, $progress) * 5}px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition:
    opacity ${CLOSE_DURATION}ms ease,
    background ${SNAP_DURATION}ms ease,
    backdrop-filter ${SNAP_DURATION}ms ease;
`;

const Sheet = styled.article<{
  $presented: boolean;
  $expanded: boolean;
  $closing: boolean;
  $dragTranslate: number | null;
}>`
  position: absolute;
  inset: 8% 0 0;
  overflow: hidden;
  border: 1px solid var(--color-neutral-300);
  border-bottom: 0;
  border-radius: 30px 30px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -16px 52px rgb(var(--color-black-rgb) / 0.18);
  transform: translateY(
    ${({ $presented, $expanded, $closing, $dragTranslate }) =>
      !$presented || $closing
        ? "100%"
        : $dragTranslate !== null
          ? `${$dragTranslate}px`
          : $expanded
            ? "0"
            : `calc(100% - ${PEEK_HEIGHT}px)`}
  );
  transition: ${({ $closing, $dragTranslate }) =>
    $dragTranslate === null
      ? `transform ${$closing ? CLOSE_DURATION : SNAP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : "none"};
  will-change: transform;

  @supports (corner-shape: squircle) {
    border-radius: 42px 42px 0 0;
    corner-shape: squircle;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;
  }
`;

const HandleButton = styled(BaseButton)`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 4;
  width: 100%;
  height: var(--space-8);
  display: grid;
  place-items: center;
  padding: 0;
  background: var(--color-surface);
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }

  i {
    width: var(--space-10);
    height: var(--space-1);
    border-radius: 999px;
    background: var(--color-neutral-500);
    transition: background 180ms ease;
  }

  &:hover i,
  &:active i {
    background: var(--color-neutral-700);
  }

  &:focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: -4px;
  }
`;

const PreviewButton = styled(BaseButton)<{ $progress: number }>`
  position: absolute;
  inset: var(--space-8) 0 auto;
  z-index: 3;
  width: 100%;
  min-height: ${PEEK_HEIGHT - 32}px;
  display: grid;
  grid-template-columns: var(--space-16) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-5)
    calc(var(--space-5) + var(--app-safe-area-bottom, 0px));
  background: linear-gradient(
    135deg,
    var(--color-surface) 38%,
    var(--color-secondary-100) 100%
  );
  color: var(--color-text);
  text-align: left;
  opacity: ${({ $progress }) =>
    Math.max(0, Math.min(1, 1 - $progress * 2.4))};
  pointer-events: ${({ $progress }) => ($progress < 0.35 ? "auto" : "none")};
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition: opacity 180ms ease;

  &:active {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: -4px;
  }
`;

const PreviewImage = styled.div<{ $image: string }>`
  width: var(--space-16);
  aspect-ratio: 1;
  border: 1px solid var(--color-neutral-300);
  border-radius: 18px;
  background-color: var(--color-accent-soft);
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  box-shadow: 0 8px 22px rgb(var(--color-black-rgb) / 0.12);

  @supports (corner-shape: squircle) {
    border-radius: 22px;
    corner-shape: squircle;
  }
`;

const PreviewCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: var(--space-1);

  small {
    color: var(--color-brand-800);
    font-size: var(--font-size-100);
    font-weight: 700;
    line-height: var(--line-height-body);
  }

  strong {
    overflow: hidden;
    font-size: var(--font-size-400);
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const PreviewMeta = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
`;

const TravelBadge = styled.span`
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  background: var(--color-brand-100);
  color: var(--color-brand-900);
  font-size: var(--font-size-100);
  font-weight: 600;
  line-height: var(--line-height-body);
`;

const PreviewPhrase = styled.p`
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const GestureHint = styled.span`
  width: fit-content;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  background: var(--color-secondary-200);
  color: var(--color-secondary-1000);
  font-size: var(--font-size-100);
  font-weight: 600;
  line-height: var(--line-height-body);

  svg {
    width: var(--space-4);
    height: var(--space-4);
  }
`;

const ContentLayer = styled.div<{
  $opacity: number;
  $interactive: boolean;
}>`
  position: absolute;
  inset: var(--space-5) 0 0;
  z-index: 2;
  overflow: hidden;
  background: var(--color-surface);
  opacity: ${({ $opacity }) => $opacity};
  transform: translateY(${({ $opacity }) => (1 - $opacity) * 20}px);
  pointer-events: ${({ $interactive }) =>
    $interactive ? "auto" : "none"};
  transition:
    opacity 260ms ease,
    transform ${SNAP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1);

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;
  }
`;
