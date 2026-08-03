"use client";

import { css, keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { Capacitor } from "@capacitor/core";
import { MapPin, Navigation, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import type { LocationRequestResult } from "@/features/tuti/location/locationAccess";
import { useDeparturePlan } from "@/features/tuti/hooks/useDeparturePlan";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import type { TutiPlace } from "@/lib/recommendations";
import type {
  DeparturePlan,
  DepartureRoute,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";
import { useTutiStore } from "@/store/tuti";

const DEPARTURE_EXIT_DURATION = 420;
const DEPARTURE_EXIT_FRAME_BUFFER = 34;
const DEPARTURE_HISTORY_STATE_KEY = "__tutiDeparturePlan";
const ROUTE_MODES: DepartureRouteMode[] = [
  "publicTransit",
  "driving",
  "bicycle",
  "walking",
];

export function DeparturePlanScreen({
  place,
  onClose,
  onNavigationStart,
  embedded = false,
  respectEmbeddedTopSafeArea = true,
}: {
  place: TutiPlace;
  onClose: () => void;
  onNavigationStart?: (route: DepartureRoute) => void;
  embedded?: boolean;
  respectEmbeddedTopSafeArea?: boolean;
}) {
  const { requestLocation } = useLocationAccess();
  const userLocation = useTutiStore((state) => state.userLocation);
  const [preferredMode, setPreferredMode] =
    useState<DepartureRouteMode | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | Exclude<LocationRequestResult["status"], "ready">
  >("idle");
  const ownsHistoryEntry = useRef(false);
  const closingFromHistory = useRef(false);
  const ignoreNextPopState = useRef(false);
  const finishCloseRef = useRef<() => void>(() => undefined);
  const requestExitRef = useRef<() => Promise<void>>(
    () => Promise.resolve(),
  );
  const departureQuery = useDeparturePlan(place.id, userLocation);
  const plan = departureQuery.data;
  const selectedMode = resolveSelectedMode(plan, preferredMode);
  const selectedRoute =
    plan && selectedMode ? plan.routes[selectedMode] : null;
  const routeGuidanceUrl =
    plan && selectedRoute
      ? resolveRouteGuidanceUrl(selectedRoute, plan)
      : null;

  const finishClose = () => {
    const shouldRemoveHistoryEntry =
      ownsHistoryEntry.current && !closingFromHistory.current;

    ownsHistoryEntry.current = false;
    closingFromHistory.current = false;
    onClose();

    if (shouldRemoveHistoryEntry) {
      ignoreNextPopState.current = true;
      window.history.back();
    }
  };
  const swipeBack = useVerticalSwipeBack({
    direction: "down",
    onBack: finishClose,
    exitDelay: DEPARTURE_EXIT_DURATION + DEPARTURE_EXIT_FRAME_BUFFER,
  });

  useLayoutEffect(() => {
    finishCloseRef.current = finishClose;
    requestExitRef.current = swipeBack.requestExit;
  });

  useLayoutEffect(() => {
    if (embedded) return;

    const currentState = getHistoryState();

    if (currentState[DEPARTURE_HISTORY_STATE_KEY] !== true) {
      window.history.pushState(
        {
          ...currentState,
          [DEPARTURE_HISTORY_STATE_KEY]: true,
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
        getHistoryState(event.state)[DEPARTURE_HISTORY_STATE_KEY] === true
      ) {
        return;
      }

      closingFromHistory.current = true;
      void requestExitRef.current().then(() => {
        finishCloseRef.current();
      });
    };

    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, [embedded]);

  const requestCurrentLocation = async () => {
    if (locationStatus === "loading") return;

    setLocationStatus("loading");
    const result = await requestLocation();
    setLocationStatus(result.status === "ready" ? "idle" : result.status);
  };

  const startRouteGuidance = (
    event: React.MouseEvent<HTMLAnchorElement>,
    route: DepartureRoute,
  ) => {
    onNavigationStart?.(route);

    if (
      !isNativeDrivingGuidance(route) ||
      !routeGuidanceUrl ||
      !route.externalUrl
    ) {
      return;
    }

    event.preventDefault();
    window.location.href = routeGuidanceUrl;
    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.open(route.externalUrl!, "_blank", "noopener,noreferrer");
      }
    }, 900);
  };

  return (
    <Frame
      role={embedded ? undefined : "dialog"}
      aria-modal={embedded ? undefined : "true"}
      aria-label={embedded ? undefined : `${place.name} 출발 준비`}
      $embedded={embedded}
      {...(embedded ? {} : swipeBack.gestureProps)}
    >
      {!embedded && (
        <Backdrop
          type="button"
          aria-label="출발 준비 닫기"
          onClick={() => swipeBack.requestBack()}
          $progress={swipeBack.dragProgress}
          $isDragging={swipeBack.isDragging}
        />
      )}
      <Sheet
        $dragY={swipeBack.dragY}
        $isDragging={swipeBack.isDragging}
        $embedded={embedded}
        $respectEmbeddedTopSafeArea={respectEmbeddedTopSafeArea}
      >
        {!embedded && <Handle aria-hidden="true" />}
        <Header>
          <HeaderCopy>
            <span>출발 준비</span>
            <h1>{place.name}</h1>
          </HeaderCopy>
          <CloseButton
            type="button"
            aria-label="출발 준비 닫기"
            onClick={() =>
              embedded ? onClose() : swipeBack.requestBack()
            }
          >
            <X aria-hidden="true" />
          </CloseButton>
        </Header>

        <ScrollContent data-scroll-region>
          <PlaceSummary>
            <PlaceImage $image={place.image} aria-hidden="true" />
            <div>
              <strong>{place.phrase}</strong>
              <p>
                <MapPin aria-hidden="true" />
                {plan?.place.address ?? "선택한 오늘의 장소"}
              </p>
            </div>
          </PlaceSummary>

          {!userLocation ? (
            <LocationRequest>
              <Navigation aria-hidden="true" />
              <h2>지금 있는 곳에서 출발할까요?</h2>
              <p>
                현재 위치는 이동 경로를 계산할 때만 사용하고 계정이나
                기록에는 남기지 않아요.
              </p>
              <LocationButton
                type="button"
                disabled={locationStatus === "loading"}
                onClick={() => void requestCurrentLocation()}
              >
                {locationStatus === "loading"
                  ? "위치 확인 중..."
                  : "현재 위치 확인하기"}
              </LocationButton>
              {locationStatus !== "idle" &&
                locationStatus !== "loading" && (
                <StatusMessage role="alert">
                  {getLocationStatusMessage(locationStatus)}
                </StatusMessage>
              )}
            </LocationRequest>
          ) : departureQuery.isPending ? (
            <CenteredStatus>
              <LoadingIndicator label="가장 가벼운 길을 찾고 있어요." />
            </CenteredStatus>
          ) : departureQuery.isError || !plan ? (
            <ErrorState>
              <h2>경로를 불러오지 못했어요.</h2>
              <p>잠시 후 다시 확인하거나 다른 장소를 살펴보세요.</p>
              <RetryButton
                type="button"
                onClick={() => void departureQuery.refetch()}
              >
                다시 불러오기
              </RetryButton>
            </ErrorState>
          ) : (
            <PlanContent>
              <Section>
                <SectionHeading>
                  <div>
                    <h2>어떻게 가는 게 편할까요?</h2>
                  </div>
                  {selectedMode === plan.recommendedMode && (
                    <RecommendedBadge>추천</RecommendedBadge>
                  )}
                </SectionHeading>

                <ModeTabs aria-label="이동수단 선택">
                  {ROUTE_MODES.map((mode) => {
                    const route = plan.routes[mode];
                    return (
                      <ModeButton
                        key={mode}
                        type="button"
                        aria-pressed={mode === selectedMode}
                        disabled={route.status !== "available"}
                        $active={mode === selectedMode}
                        onClick={() => setPreferredMode(mode)}
                      >
                        <strong>{getModeLabel(mode)}</strong>
                        <span>
                          {route.status === "available"
                            ? formatDuration(route.durationSeconds)
                            : "경로 없음"}
                        </span>
                      </ModeButton>
                    );
                  })}
                </ModeTabs>

                {selectedRoute && (
                  <RouteCard>
                    <RouteHeadline>
                      <div>
                        <small>{getModeLabel(selectedRoute.mode)}</small>
                        <strong>
                          {formatDuration(selectedRoute.durationSeconds)}
                        </strong>
                      </div>
                      <span>{formatDistance(selectedRoute.distanceMeters)}</span>
                    </RouteHeadline>
                    <RouteFacts>
                      {getRouteFacts(selectedRoute).map((fact) => (
                        <span key={fact}>{fact}</span>
                      ))}
                    </RouteFacts>
                    {selectedRoute.steps.length > 0 && (
                      <RouteSteps>
                        {selectedRoute.steps.slice(0, 3).map((step, index) => (
                          <li key={`${step.guidance}-${index}`}>
                            <i>{index + 1}</i>
                            <span>
                              <strong>{step.guidance}</strong>
                              {step.vehicle && <small>{step.vehicle}</small>}
                            </span>
                          </li>
                        ))}
                      </RouteSteps>
                    )}
                    {routeGuidanceUrl && (
                      <RouteLink
                        href={routeGuidanceUrl}
                        target={
                          isNativeDrivingGuidance(selectedRoute)
                            ? undefined
                            : "_blank"
                        }
                        rel="noreferrer"
                        data-swipe-back-ignore
                        onClick={(event) =>
                          startRouteGuidance(event, selectedRoute)
                        }
                      >
                        {isNativeDrivingGuidance(selectedRoute)
                          ? "카카오내비로 출발하기"
                          : "길찾기 시작하기"}
                        <Navigation aria-hidden="true" />
                      </RouteLink>
                    )}
                  </RouteCard>
                )}
              </Section>

              {plan.suggestedPlan.length > 0 && (
                <Section>
                <SectionHeading>
                  <div>
                    <h2>가서는 이만큼만 해도 충분해요.</h2>
                  </div>
                  </SectionHeading>
                  <SuggestedSteps>
                    {plan.suggestedPlan.map((step, index) => (
                      <li key={`${step.kind}-${index}`}>
                        <i aria-hidden="true" />
                        <span>
                          <strong>{step.title}</strong>
                          {step.description && <small>{step.description}</small>}
                        </span>
                      </li>
                    ))}
                  </SuggestedSteps>
                </Section>
              )}

              {plan.nearbyPlaces.length > 0 && (
                <Section>
                <SectionHeading>
                  <div>
                    <h2>조금 더 머물고 싶다면</h2>
                  </div>
                  </SectionHeading>
                  <NearbyList>
                    {plan.nearbyPlaces.slice(0, 4).map((nearby) => (
                      <a
                        key={nearby.id}
                        href={nearby.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        data-swipe-back-ignore
                      >
                        <strong>{nearby.name}</strong>
                        <span>
                          {getNearbyCategoryLabel(nearby.category)}
                          {nearby.distanceMeters !== null &&
                            ` · ${formatDistance(nearby.distanceMeters)}`}
                        </span>
                      </a>
                    ))}
                  </NearbyList>
                </Section>
              )}
            </PlanContent>
          )}
        </ScrollContent>
      </Sheet>
    </Frame>
  );
}

function resolveSelectedMode(
  plan: DeparturePlan | undefined,
  preferredMode: DepartureRouteMode | null,
) {
  if (!plan) return null;
  if (preferredMode && plan.routes[preferredMode].status === "available") {
    return preferredMode;
  }
  if (plan.recommendedMode) return plan.recommendedMode;
  return (
    ROUTE_MODES.find((mode) => plan.routes[mode].status === "available") ??
    null
  );
}

function getModeLabel(mode: DepartureRouteMode) {
  return {
    publicTransit: "대중교통",
    driving: "자동차",
    bicycle: "자전거",
    walking: "도보",
  }[mode];
}

function getLocationStatusMessage(
  status: Exclude<LocationRequestResult["status"], "ready">,
) {
  if (status === "declined") {
    return "괜찮아요. 위치 없이도 장소 정보를 계속 볼 수 있어요.";
  }
  if (status === "denied") {
    return "기기 설정에서 Tuti의 위치 권한을 허용한 뒤 다시 시도해주세요.";
  }
  if (status === "timeout") {
    return "위치 확인이 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.";
  }
  return "현재 기기에서는 위치를 확인할 수 없어요.";
}

function resolveRouteGuidanceUrl(
  route: DepartureRoute,
  plan: DeparturePlan,
) {
  if (isNativeDrivingGuidance(route)) {
    const parameters = new URLSearchParams({
      name: plan.place.name,
      x: String(plan.place.longitude),
      y: String(plan.place.latitude),
      coord_type: "wgs84",
    });
    return `kakaonavi://navigate?${parameters.toString()}`;
  }

  return route.externalUrl;
}

function isNativeDrivingGuidance(route: DepartureRoute) {
  return route.mode === "driving" && Capacitor.isNativePlatform();
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "시간 확인 필요";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `약 ${minutes}분`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `약 ${hours}시간 ${remainder}분` : `약 ${hours}시간`;
}

function formatDistance(meters: number | null) {
  if (meters === null) return "거리 확인 필요";
  return meters < 1_000
    ? `${Math.round(meters)}m`
    : `${(meters / 1_000).toFixed(1)}km`;
}

function getRouteFacts(route: DepartureRoute) {
  const facts = [];
  if (route.transfers !== null) facts.push(`환승 ${route.transfers}회`);
  if (route.fareWon !== null) facts.push(`요금 약 ${formatWon(route.fareWon)}`);
  if (route.tollWon !== null && route.tollWon > 0) {
    facts.push(`통행료 ${formatWon(route.tollWon)}`);
  }
  if (route.taxiFareWon !== null && route.taxiFareWon > 0) {
    facts.push(`택시 약 ${formatWon(route.taxiFareWon)}`);
  }
  return facts.length ? facts : ["경로에 따라 달라질 수 있어요"];
}

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function getNearbyCategoryLabel(category: DeparturePlan["nearbyPlaces"][number]["category"]) {
  return {
    attraction: "둘러볼 곳",
    culture: "문화 공간",
    cafe: "잠깐 쉴 곳",
  }[category];
}

function getHistoryState(state: unknown = window.history.state) {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
}

const sheetEnter = keyframes`
  from {
    opacity: 0.7;
    transform: translateY(100%);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const backdropEnter = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const Frame = styled.section<{ $embedded: boolean }>`
  position: absolute;
  inset: 0;
  z-index: ${({ $embedded }) => ($embedded ? 0 : 40)};
  overflow: hidden;
  touch-action: pan-y;
`;

const Backdrop = styled(BaseButton)<{
  $progress: number;
  $isDragging: boolean;
}>`
  position: absolute;
  inset: 0;
  width: 100%;
  padding: 0;
  background: rgb(var(--color-black-rgb) / 0.24);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  opacity: ${({ $progress }) => 1 - $progress};
  animation: ${backdropEnter} 320ms ease;
  transition: ${({ $isDragging }) =>
    $isDragging
      ? "none"
      : `opacity ${DEPARTURE_EXIT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};
`;

const Sheet = styled.article<{
  $dragY: number;
  $isDragging: boolean;
  $embedded: boolean;
  $respectEmbeddedTopSafeArea: boolean;
}>`
  position: absolute;
  inset: ${({ $embedded }) => ($embedded ? "0" : "8% 0 0")};
  display: flex;
  flex-direction: column;
  padding: ${({ $embedded, $respectEmbeddedTopSafeArea }) =>
    $embedded
      ? `${
          $respectEmbeddedTopSafeArea
            ? "calc(var(--space-5) + var(--app-safe-area-top, 0px))"
            : "var(--space-5)"
        }
        calc(var(--space-5) + var(--app-safe-area-right, 0px))
        calc(var(--space-5) + var(--app-safe-area-bottom, 0px))
        calc(var(--space-5) + var(--app-safe-area-left, 0px))`
      : `var(--space-3) var(--space-5)
        calc(var(--space-5) + var(--app-safe-area-bottom, 0px))`};
  border-radius: ${({ $embedded }) =>
    $embedded ? "0" : "32px 32px 0 0"};
  background: var(--color-surface);
  box-shadow: ${({ $embedded }) =>
    $embedded
      ? "none"
      : "0 -16px 52px rgb(var(--color-black-rgb) / 0.16)"};
  transform: translateY(
    ${({ $dragY, $embedded }) => ($embedded ? 0 : Math.max(0, $dragY))}px
  );
  animation: ${({ $embedded }) =>
    $embedded
      ? "none"
      : css`${sheetEnter} 420ms cubic-bezier(0.22, 1, 0.36, 1)`};
  transition: ${({ $isDragging, $embedded }) =>
    $embedded || $isDragging
      ? "none"
      : `transform ${DEPARTURE_EXIT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};

  @supports (corner-shape: squircle) {
    border-radius: ${({ $embedded }) =>
      $embedded ? "0" : "44px 44px 0 0"};
    corner-shape: squircle;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition-duration: 1ms;
  }
`;

const Handle = styled.div`
  width: 42px;
  height: 5px;
  flex: 0 0 auto;
  align-self: center;
  margin-bottom: var(--space-3);
  border-radius: 999px;
  background: var(--color-border);
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
`;

const HeaderCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  h1 {
    overflow: hidden;
    font-size: var(--font-size-500);
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const CloseButton = styled(BaseButton)`
  width: var(--space-10);
  height: var(--space-10);
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  background: var(--color-neutral-200);
  color: var(--color-text-muted);

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ScrollContent = styled.div`
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 0 1px var(--space-6);
  overscroll-behavior: contain;
  touch-action: pan-y;
`;

const PlaceSummary = styled.div`
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: 22px;
  background: var(--color-secondary-100);

  > div:last-child {
    min-width: 0;
    display: grid;
    gap: var(--space-2);
  }

  strong {
    font-size: var(--font-size-200);
    line-height: var(--line-height-subtitle);
  }

  p {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);

    svg {
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
      margin-top: 2px;
      color: var(--color-brand-500);
    }
  }
`;

const PlaceImage = styled.div<{ $image: string }>`
  width: 72px;
  aspect-ratio: 1;
  border-radius: 18px;
  background-color: var(--color-accent-soft);
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
`;

const LocationRequest = styled.section`
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-3);
  text-align: center;

  > svg {
    width: 42px;
    height: 42px;
    padding: 10px;
    border-radius: 50%;
    background: var(--color-secondary-200);
    color: var(--color-secondary-900);
  }

  h2 {
    font-size: var(--font-size-400);
    line-height: var(--line-height-heading);
  }

  p {
    max-width: 280px;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const LocationButton = styled(PrimaryButton)`
  width: min(100%, 280px);
  margin-top: var(--space-2);
  font-size: var(--font-size-200);
`;

const StatusMessage = styled.p`
  color: var(--color-error) !important;
`;

const CenteredStatus = styled.div`
  min-height: 400px;
  display: grid;
  place-items: center;
`;

const ErrorState = styled.section`
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  text-align: center;

  h2 {
    font-size: var(--font-size-400);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const RetryButton = styled(BaseButton)`
  min-height: var(--space-11);
  padding: 0 var(--space-5);
  border-radius: 999px;
  background: var(--color-secondary-500);
  color: var(--color-text);
  font-weight: 600;
`;

const PlanContent = styled.div`
  display: grid;
  gap: var(--space-8);
  padding-top: var(--space-6);
`;

const Section = styled.section`
  display: grid;
  gap: var(--space-4);
`;

const SectionHeading = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);

  > div {
    display: grid;
  }

  h2 {
    font-size: var(--font-size-300);
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
  }
`;

const RecommendedBadge = styled.span`
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-secondary-500);
  color: var(--color-text);
  font-size: var(--font-size-100);
  font-weight: 600;
`;

const ModeTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
`;

const ModeButton = styled(BaseButton)<{ $active: boolean }>`
  min-width: 0;
  min-height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: var(--space-2) var(--space-1);
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--color-brand-500)" : "var(--color-border)"};
  border-radius: 16px;
  background: ${({ $active }) =>
    $active ? "var(--color-brand-100)" : "var(--color-surface)"};
  color: ${({ $active }) =>
    $active ? "var(--color-text)" : "var(--color-text-muted)"};

  strong {
    font-size: var(--font-size-100);
    white-space: nowrap;
  }

  span {
    overflow: hidden;
    max-width: 100%;
    font-size: calc(var(--font-size-100) - 2px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:disabled {
    cursor: default;
    opacity: 0.46;
  }
`;

const RouteCard = styled.div`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: 24px;
  background: var(--color-neutral-1300);
  color: var(--color-white);
  box-shadow: 0 16px 38px rgb(var(--color-black-rgb) / 0.16);
`;

const RouteHeadline = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);

  > div {
    display: grid;
    gap: 2px;
  }

  small {
    color: rgb(var(--color-white-rgb) / 0.68);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-500);
    line-height: var(--line-height-heading);
  }

  > span {
    color: rgb(var(--color-white-rgb) / 0.76);
    font-size: var(--font-size-200);
  }
`;

const RouteFacts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);

  span {
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: rgb(var(--color-white-rgb) / 0.12);
    color: rgb(var(--color-white-rgb) / 0.82);
    font-size: var(--font-size-100);
  }
`;

const RouteSteps = styled.ol`
  display: grid;
  gap: var(--space-3);

  li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  i {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--color-secondary-500);
    color: var(--color-text);
    font-size: calc(var(--font-size-100) - 2px);
    font-style: normal;
    font-weight: 700;
  }

  span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  strong {
    font-size: var(--font-size-100);
    font-weight: 500;
    line-height: var(--line-height-body);
  }

  small {
    color: rgb(var(--color-white-rgb) / 0.58);
    font-size: calc(var(--font-size-100) - 2px);
  }
`;

const RouteLink = styled.a`
  min-height: var(--space-12);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: 999px;
  background: var(--color-secondary-500);
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-weight: 700;
  text-decoration: none;

  svg {
    width: 17px;
    height: 17px;
  }
`;

const SuggestedSteps = styled.ol`
  display: grid;
  gap: var(--space-3);

  li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: 20px;
    background: var(--color-secondary-100);
  }

  i {
    width: 10px;
    height: 10px;
    flex: 0 0 auto;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--color-secondary-500);
  }

  span {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  strong {
    font-size: var(--font-size-100);
    line-height: var(--line-height-subtitle);
  }

  small {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-100) - 1px);
    line-height: var(--line-height-body);
    white-space: pre-line;
  }
`;

const NearbyList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);

  a {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 18px;
    color: var(--color-text);
    text-decoration: none;
  }

  strong {
    overflow: hidden;
    font-size: var(--font-size-100);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-100) - 2px);
  }
`;
