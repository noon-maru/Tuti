"use client";

import styled from "@emotion/styled";
import {
  CalendarDays,
  Car,
  Clock3,
  MapPin,
  Ticket,
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { usePlaceDetail } from "@/features/tuti/hooks/usePlaceDetail";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import { shareContent } from "@/lib/shareContent";
import {
  getCrowdForecastBasisLabel,
  getCrowdForecastLevelLabel,
  type TutiPlace,
} from "@/lib/recommendations";
import type { TourismPlaceDetail } from "@/shared/api/placeDetails";
import { fluidByViewportHeight } from "@/styles/tokens";

const DETAIL_EXIT_DURATION = 480;
const DETAIL_EXIT_FRAME_BUFFER = 34;
const DETAIL_HISTORY_STATE_KEY = "__tutiDetailOverlay";

export function DetailScreen({
  place,
  travelTimeLabel,
  onBack,
  onExitStart,
  historyActive = false,
  revealProgress = 1,
}: {
  place: TutiPlace;
  travelTimeLabel: string;
  onBack: () => void;
  onExitStart?: () => void;
  historyActive?: boolean;
  revealProgress?: number;
}) {
  const detailQuery = usePlaceDetail(
    place.id,
    historyActive || revealProgress > 0.35,
  );
  const detailResponse = detailQuery.data;
  const detail = detailResponse?.detail ?? null;
  const locationLabel =
    detailResponse?.place.region ?? detailResponse?.place.address;
  const facts = createDetailFacts(detail);
  const crowdBadge = createCrowdBadge(place);
  const operationBadge = createOperationBadge(detail);
  const subtitle = createPlaceSubtitle(place);
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
    <Frame {...swipeBack.gestureProps}>
      <Backdrop
        type="button"
        aria-label="추천 화면으로 돌아가기"
        onClick={closeFromBackdrop}
        $revealProgress={revealProgress}
        $progress={swipeBack.dragProgress}
        $isDragging={swipeBack.isDragging}
      />
      <Sheet
        $revealProgress={revealProgress}
        $dragY={swipeBack.dragY}
        $isDragging={swipeBack.isDragging}
      >
        <HeroImage
          role="img"
          $image={place.image}
          $revealProgress={revealProgress}
          aria-label={`${place.name} 풍경`}
        />
        <Content $revealProgress={revealProgress}>
          <TopLine>
            <LocationLabel>
              <MapPin aria-hidden="true" />
              <span>{locationLabel ?? "오늘 고른 공간"}</span>
            </LocationLabel>
            <ContextMenu
              label={`${place.name} 메뉴`}
              items={[
                {
                  label: "장소 공유하기",
                  onSelect: () =>
                    shareContent({
                      title: place.name,
                      text: `${place.phrase}\n${getFallbackDescription(place)}`,
                      url: window.location.href,
                    }),
                },
                {
                  label: "추천 화면으로 돌아가기",
                  onSelect: closeFromBackdrop,
                },
              ]}
            />
          </TopLine>

          <Heading>
            <h1>{place.name}</h1>
            {subtitle && <p>{subtitle}</p>}
          </Heading>

          <Tags aria-label="장소 정보">
            <Tag $tone="brand">{travelTimeLabel}</Tag>
            {crowdBadge && <Tag $tone="secondary">{crowdBadge}</Tag>}
            {operationBadge && <Tag $tone="neutral">{operationBadge}</Tag>}
          </Tags>

          <Description data-scroll-region>
            <ReasonCard>
              <small>오늘 이곳을 고른 이유</small>
              <strong>{place.reason ?? place.phrase}</strong>
              <p>{createBurdenCopy(place)}</p>
            </ReasonCard>

            <Section>
              <SectionTitle>
                <small>공간 소개</small>
                <h2>어떤 곳인가요?</h2>
              </SectionTitle>
              {detail?.overview ? (
                <Overview>{detail.overview}</Overview>
              ) : detailQuery.isPending ? (
                <DetailLoading aria-label="장소 상세정보 불러오는 중">
                  <i />
                  <i />
                  <i />
                </DetailLoading>
              ) : (
                <Overview>{getFallbackDescription(place)}</Overview>
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
                <SectionTitle>
                  <small>가기 전에</small>
                  <h2>이 정도만 알고 가세요.</h2>
                </SectionTitle>
                <FactGrid>
                  {facts.map((fact) => {
                    const Icon = fact.icon;
                    return (
                      <FactCard key={fact.label} title={fact.value}>
                        <Icon aria-hidden="true" />
                        <span>{fact.label}</span>
                        <strong>{fact.value}</strong>
                      </FactCard>
                    );
                  })}
                </FactGrid>
              </Section>
            )}

            {detail && detail.images.length > 0 && (
              <Section>
                <SectionTitle>
                  <small>미리 보는 풍경</small>
                  <h2>공간의 다른 모습이에요.</h2>
                </SectionTitle>
                <PhotoStrip aria-label={`${place.name} 추가 사진`}>
                  {detail.images.slice(0, 4).map((image, index) => (
                    <Photo
                      key={`${image.url}-${index}`}
                      role="img"
                      aria-label={image.title ?? `${place.name} 사진 ${index + 1}`}
                      $image={image.thumbnailUrl ?? image.url}
                    />
                  ))}
                </PhotoStrip>
              </Section>
            )}

            <DataNotice>
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
              {detail?.isStale && (
                <span>운영 정보는 최근 저장된 내용을 보여드리고 있어요.</span>
              )}
            </DataNotice>
          </Description>
        </Content>
      </Sheet>
    </Frame>
  );
}

function createDetailFacts(detail: TourismPlaceDetail | null) {
  if (!detail) return [];

  const facts: Array<{
    label: string;
    value: string;
    icon: typeof Clock3;
  }> = [];

  if (detail.openingHours) {
    facts.push({
      label: "이용 시간",
      value: detail.openingHours,
      icon: Clock3,
    });
  }
  if (detail.restDate) {
    facts.push({
      label: "쉬는 날",
      value: detail.restDate,
      icon: CalendarDays,
    });
  }
  if (detail.usageDuration) {
    facts.push({
      label: "머무는 시간",
      value: detail.usageDuration,
      icon: Clock3,
    });
  }
  if (detail.admissionFee) {
    facts.push({
      label: "이용 요금",
      value: detail.admissionFee,
      icon: Ticket,
    });
  }
  if (detail.parking) {
    facts.push({
      label: "주차",
      value: detail.parking,
      icon: Car,
    });
  }

  return facts.slice(0, 3);
}

function createCrowdBadge(place: TutiPlace) {
  if (place.crowdForecast) {
    return `예상 혼잡도 · ${getCrowdForecastLevelLabel(place.crowdForecast)}`;
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
  return "관광공사 방문 패턴을 바탕으로 한 예상값이며 실제 현장과 다를 수 있어요.";
}

function createOperationBadge(detail: TourismPlaceDetail | null) {
  if (!detail) return null;

  const restDate = compactLabel(detail.restDate);
  if (restDate && /연중\s*무휴|연중무휴/.test(restDate)) {
    return "연중무휴";
  }

  const openingHours = compactLabel(detail.openingHours);
  if (openingHours && openingHours.length <= 14) return openingHours;
  if (openingHours || restDate) return "운영정보 확인됨";
  return null;
}

function compactLabel(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function createPlaceSubtitle(place: TutiPlace) {
  const phrase = place.phrase.trim();
  if (!phrase || phrase === "잠깐 다른 공기를 만나기 좋은 곳") return null;
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
  if (place.movementLevel === "near") {
    return "멀리 준비하지 않아도 닿을 수 있는 쪽으로 골랐어요.";
  }
  if (place.movementLevel === "half") {
    return "조금 여유를 내어 천천히 다녀오기 좋은 선택이에요.";
  }
  return "오늘 가능한 정도 안에서 가볍게 다녀올 수 있어요.";
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
  background: rgb(var(--color-black-rgb) / 0.18);
  backdrop-filter: blur(${({ $revealProgress }) => $revealProgress * 10}px);
  -webkit-backdrop-filter: blur(${({ $revealProgress }) => $revealProgress * 10}px);
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
}>`
  --detail-hero-width: ${fluidByViewportHeight(128, 160)};
  --detail-content-start: ${fluidByViewportHeight(132, 172)};

  position: absolute;
  inset: 24% 0 0;
  display: flex;
  flex-direction: column;
  padding: var(--detail-content-start) var(--space-5)
    calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
  border-radius: 32px 32px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -12px 44px rgb(var(--color-black-rgb) / 0.1);
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
    border-radius: 44px 44px 0 0;
    corner-shape: squircle;
  }
`;

const HeroImage = styled.div<{ $image: string; $revealProgress: number }>`
  position: absolute;
  z-index: 2;
  top: ${fluidByViewportHeight(-92, -112)};
  left: 50%;
  width: var(--detail-hero-width);
  aspect-ratio: 3 / 5;
  border-radius: 22px;
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
  box-shadow: 0 14px 30px rgb(var(--color-black-rgb) / 0.24);
  opacity: ${({ $revealProgress }) =>
    Math.max(0, Math.min(($revealProgress - 0.58) / 0.3, 1))};
  transform: translateX(-50%);
`;

const Content = styled.div<{ $revealProgress: number }>`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  opacity: ${({ $revealProgress }) =>
    Math.max(0, Math.min(($revealProgress - 0.68) / 0.32, 1))};
  transform: translateY(
    ${({ $revealProgress }) =>
      (1 - Math.max(0, Math.min(($revealProgress - 0.68) / 0.32, 1))) * 12}px
  );
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

  svg {
    width: var(--space-4);
    height: var(--space-4);
    flex: 0 0 auto;
    color: var(--color-brand-700);
    stroke-width: 2;
  }

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
`;

const Tag = styled.span<{ $tone: "brand" | "neutral" | "secondary" }>`
  min-width: 0;
  min-height: var(--space-8);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-3);
  overflow: hidden;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-300)"
      : $tone === "secondary"
        ? "var(--color-secondary-300)"
        : "var(--color-neutral-300)"};
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-weight: 550;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Heading = styled.header`
  display: grid;
  gap: var(--space-1);

  h1 {
    min-width: 0;
    font-size: var(--font-size-600);
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }
`;

const Description = styled.div`
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-8);
  padding: var(--space-4) 1px var(--space-5);
  overflow-y: auto;
  overscroll-behavior-y: contain;
  touch-action: pan-y;

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
  display: grid;
  gap: var(--space-4);
`;

const SectionTitle = styled.header`
  display: grid;
  gap: 2px;

  small {
    color: var(--color-brand-800);
    font-size: var(--font-size-100);
    font-weight: 600;
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
  }

  h2 {
    font-size: var(--font-size-300);
    font-weight: 650;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }
`;

const Overview = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
  white-space: pre-line;
`;

const DetailLoading = styled.div`
  display: grid;
  gap: var(--space-2);

  i {
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--color-neutral-300),
      var(--color-neutral-200),
      var(--color-neutral-300)
    );
    background-size: 220% 100%;
    animation: detail-loading 1.4s ease-in-out infinite;
  }

  i:nth-of-type(2) {
    width: 92%;
  }

  i:nth-of-type(3) {
    width: 68%;
  }

  @keyframes detail-loading {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -120% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    i {
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

const FactCard = styled.div`
  min-width: 0;
  min-height: 92px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: start;
  gap: var(--space-1) var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-neutral-300);
  border-radius: 16px;
  background: var(--color-neutral-200);

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

const PhotoStrip = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(112px, 42%);
  gap: var(--space-2);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Photo = styled.div<{ $image: string }>`
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  background-color: var(--color-neutral-200);
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  scroll-snap-align: start;
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
