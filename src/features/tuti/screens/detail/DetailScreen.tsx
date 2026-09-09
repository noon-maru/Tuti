"use client";

import styled from "@emotion/styled";
import {
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Ticket,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { TutiPlaceIcon } from "@/features/tuti/components/TutiPlaceIcon";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { usePlaceDetail } from "@/features/tuti/hooks/usePlaceDetail";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import { getPublicPlaceUrl } from "@/features/tuti/lib/placeShare";
import {
  createOperationBadge,
  createVisitInformationFacts,
  type VisitInformationFact,
} from "@/features/tuti/lib/visitInformation";
import { shareContent } from "@/lib/shareContent";
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
const DETAIL_HISTORY_STATE_KEY = "__tutiDetailOverlay";
const PHOTO_VIEWER_DURATION = 560;
const PHOTO_VIEWER_ZOOM = 1.65;
const PHOTO_DRAG_THRESHOLD = 4;

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
  const [selectedPhoto, setSelectedPhoto] =
    useState<TourismPlaceDetailImage | null>(null);
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
    <Frame {...(selectedPhoto ? {} : swipeBack.gestureProps)}>
      <Backdrop
        type="button"
        aria-label={backLabel}
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
                  onSelect: () =>
                    shareContent({
                      title: place.name,
                      text: `${place.phrase}\n${getFallbackDescription(place)}`,
                      url: getPublicPlaceUrl(place.id),
                    }),
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

          <Heading>
            <h1>{place.name}</h1>
            {subtitle && <p>{subtitle}</p>}
          </Heading>

          <Tags aria-label="장소 정보">
            <Tag $tone="brand">{travelTimeLabel}</Tag>
            {crowdBadge && <Tag $tone="secondary">{crowdBadge}</Tag>}
            {weatherBadge && <Tag $tone="secondary">{weatherBadge}</Tag>}
            {operationBadge && <Tag $tone="neutral">{operationBadge}</Tag>}
          </Tags>

          <Description data-scroll-region>
            <ReasonCard>
              <small>오늘 이곳을 고른 이유</small>
              <strong>{place.reason ?? place.phrase}</strong>
              <p>{createBurdenCopy(place)}</p>
            </ReasonCard>

            <Section>
              <SectionTitle>어떤 곳인가요?</SectionTitle>
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
  min-width: 0;
  max-width: 100%;
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
  width: 100%;
  min-width: 0;
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
  width: 100%;
  min-width: 0;
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
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);

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
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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
