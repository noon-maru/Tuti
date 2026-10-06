"use client";

import styled from "@emotion/styled";
import { RotateCcw } from "lucide-react";
import type { PointerEvent } from "react";
import { getPlaceDisplayPhrase } from "@/features/tuti/lib/placeDisplayCopy";
import type { TutiPlace } from "@/lib/recommendations";
import type { PlaceSuggestedStep } from "@/shared/api/placeDetails";
import {
  fluidByCompactViewportHeight,
  fluidByViewportHeight,
} from "@/styles/tokens";
import { BaseButton, Button } from "./buttons";
import { TutiPlaceIcon } from "./TutiPlaceIcon";

type SwipeCardProps = {
  cardIndex: number;
  place: TutiPlace;
  offset: number;
  active: boolean;
  flipped?: boolean;
  travelTimeLabel: string;
  showPlaceName?: boolean;
  showPublicTransitTime?: boolean;
  suggestedStep?: PlaceSuggestedStep;
  overviewSummary?: string | null;
  suggestionLoading?: boolean;
  savedForLater?: boolean;
  onActivate?: () => void;
  onShowFront?: () => void;
  onShowDetail?: () => void;
  onOpenDeparture?: () => void;
  onToggleSavedForLater?: () => void;
  drag?: { x: number; y: number };
  nudging?: "up" | "down" | null;
  detailProgress?: number;
};

export function SwipeCard({
  cardIndex,
  place,
  offset,
  active,
  flipped = false,
  travelTimeLabel,
  showPlaceName = true,
  showPublicTransitTime = true,
  suggestedStep,
  overviewSummary,
  suggestionLoading = false,
  savedForLater = false,
  onActivate,
  onShowFront,
  onShowDetail,
  onOpenDeparture,
  onToggleSavedForLater,
  drag,
  nudging,
  detailProgress = 0,
}: SwipeCardProps) {
  const hidden = Math.abs(offset) > 2;
  const imageReady = Math.abs(offset) <= 1;
  const dragX = active ? drag?.x ?? 0 : 0;
  const dragY = active ? drag?.y ?? 0 : 0;
  const baseX = offset * 78;
  const scale = active ? 1 - detailProgress * 0.5 : 0.88;
  const rotation = offset * -4 + dragX / 22;
  const action = suggestedStep ?? createFallbackAction(place);
  const description = overviewSummary?.trim() ||
    "전부 둘러보지 않아도 괜찮아요. 지금 편한 만큼이면 충분해요.";

  return (
    <CardShell
      $active={active}
      $dragging={active && Boolean(drag)}
      $nudging={active ? nudging ?? null : null}
      $detailProgress={detailProgress}
      data-swipe-card-index={cardIndex}
      style={{
        transform: `translate(${baseX + dragX}px, ${dragY}px) scale(${scale}) rotate(${rotation}deg)`,
        opacity: hidden ? 0 : active ? 1 : 0.56,
        zIndex: 10 - Math.abs(offset),
      }}
    >
      <FlipBody $flipped={active && flipped}>
        <FrontFace
          type="button"
          $image={imageReady ? place.image : null}
          $flipped={active && flipped}
          aria-label={`${place.name} 가볍게 살펴보기`}
          aria-hidden={active && flipped}
          inert={active && flipped}
          onClick={onActivate}
        >
          {(showPlaceName || showPublicTransitTime) && (
            <CardIdentity aria-live={active ? "polite" : undefined}>
              {showPlaceName && <strong>{place.name}</strong>}
              {showPublicTransitTime && <small>{travelTimeLabel}</small>}
            </CardIdentity>
          )}
          <CardPhrase>{getPlaceDisplayPhrase(place)}</CardPhrase>
          {active && <CardHint>눌러서 가볍게 보기</CardHint>}
        </FrontFace>

        <BackFace
          $flipped={active && flipped}
          aria-hidden={!active || !flipped}
          inert={!active || !flipped}
        >
          <BackHeader>
            <BackIdentity>
              <span><TutiPlaceIcon $size="small" aria-hidden="true" />추천한 공간</span>
              <strong>{place.name}</strong>
              {showPublicTransitTime && <small>{travelTimeLabel}</small>}
            </BackIdentity>
            <TurnBackButton
              type="button"
              aria-label="카드 앞면 보기"
              onPointerDown={stopCardActionPointer}
              onClick={onShowFront}
            >
              <RotateCcw aria-hidden="true" />
              앞면
            </TurnBackButton>
          </BackHeader>

          <ActionCopy aria-live="polite">
            {suggestionLoading ? (
              <ActionLoading>이곳에서 가볍게 할 일을 살펴보고 있어요.</ActionLoading>
            ) : (
              <>
                <strong>{action.title}</strong>
                <small>{description}</small>
              </>
            )}
          </ActionCopy>

          <BackActions>
            <DepartureButton
              type="button"
              $tone="secondary"
              onPointerDown={stopCardActionPointer}
              onClick={onOpenDeparture}
            >
              출발 준비하기
            </DepartureButton>
            <SecondaryActions>
              <QuietButton
                type="button"
                onPointerDown={stopCardActionPointer}
                onClick={onShowDetail}
              >
                장소 자세히
              </QuietButton>
              <QuietButton
                type="button"
                aria-pressed={savedForLater}
                onPointerDown={stopCardActionPointer}
                onClick={onToggleSavedForLater}
              >
                {savedForLater ? "저장 취소" : "공간 저장"}
              </QuietButton>
            </SecondaryActions>
          </BackActions>
        </BackFace>
      </FlipBody>
    </CardShell>
  );
}

function stopCardActionPointer(event: PointerEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

function createFallbackAction(place: TutiPlace): PlaceSuggestedStep {
  const titleByType = {
    waterside: "물가를 따라 부담 없는 만큼만 걸어보기",
    forest_garden: "마음이 편해지는 길 하나만 천천히 걸어보기",
    art_exhibition: "마음이 가는 작품 한 점부터 바라보기",
    museum_story: "끌리는 이야기 하나만 골라 천천히 보기",
    history_heritage: "가장 조용한 길부터 천천히 둘러보기",
    viewpoint: "전망이 트이는 자리까지만 가보기",
    neighborhood: "끌리는 골목이나 가게 한 곳만 골라보기",
    activity: "오늘 가능한 활동 하나만 가볍게 해보기",
    wellness: "몸이 편해지는 자리에서 잠시 쉬어보기",
    other: "마음이 가는 공간 하나만 천천히 둘러보기",
  } as const;

  return {
    kind: "arrival",
    title: titleByType[place.experienceType ?? "other"],
    description: "전부 둘러보지 않아도 괜찮아요. 지금 편한 만큼이면 충분해요.",
  };
}

const CardShell = styled.div<{
  $active: boolean;
  $dragging: boolean;
  $nudging: "up" | "down" | null;
  $detailProgress: number;
}>`
  position: absolute;
  width: min(calc(100% - var(--space-2)), ${fluidByViewportHeight(256, 312)});
  aspect-ratio: 3 / 5;
  border-radius: ${({ $detailProgress }) => 32 + $detailProgress * 7}px;
  perspective: 1200px;
  filter: drop-shadow(
    0 ${({ $active }) => ($active ? 28 : 20)}px
    ${({ $active }) => ($active ? 35 : 27)}px
    rgb(var(--color-black-rgb) / ${({ $active }) => ($active ? 0.23 : 0.18)})
  );
  transition: ${({ $dragging }) =>
    $dragging ? "opacity 160ms ease" : "transform 360ms ease, opacity 260ms ease"};
  will-change: transform;
  animation: ${({ $nudging }) =>
    $nudging === "up"
      ? "nudgeUp 520ms ease"
      : $nudging === "down"
        ? "nudgeDown 520ms ease"
        : "none"};

  @supports (corner-shape: squircle) {
    border-radius: 50px;
    corner-shape: squircle;
  }

  @container app-viewport (max-height: 689px) {
    width: min(calc(100% - var(--space-2)), ${fluidByCompactViewportHeight(210, 256)});
  }

  @container app-viewport (min-width: 600px) and (min-height: 700px) {
    width: clamp(312px, 46cqw, 360px);
  }

  @keyframes nudgeUp {
    0%, 100% { translate: 0 0; }
    34% { translate: 0 -18px; }
    62% { translate: 0 5px; }
  }

  @keyframes nudgeDown {
    0%, 100% { translate: 0 0; }
    34% { translate: 0 18px; }
    62% { translate: 0 -5px; }
  }
`;

const FlipBody = styled.div<{ $flipped: boolean }>`
  position: absolute;
  inset: 0;
  border-radius: inherit;
  transform: rotateY(${({ $flipped }) => ($flipped ? 180 : 0)}deg);
  transform-style: preserve-3d;
  transition: transform 440ms cubic-bezier(0.22, 0.72, 0.2, 1);
  will-change: transform;

  @media (prefers-reduced-motion: reduce) {
    transform: none;
  }
`;

const CardFace = styled.div<{ $flipped: boolean }>`
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;

  @media (prefers-reduced-motion: reduce) {
    transition: opacity 120ms ease;
  }
`;

const FrontFace = styled(BaseButton)<{ $image: string | null; $flipped: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--space-1);
  padding: var(--space-5);
  overflow: hidden;
  border-radius: inherit;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  background-color: var(--color-accent-secondary);
  background-image: ${({ $image }) => $image ? `url(${$image})` : "none"};
  background-position: center;
  background-size: cover;
  color: var(--color-white);
  text-align: left;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 28%, rgb(var(--color-black-rgb) / 0.62));
  }

  > * {
    position: relative;
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    opacity: ${({ $flipped }) => ($flipped ? 0 : 1)};
    pointer-events: ${({ $flipped }) => ($flipped ? "none" : "auto")};
  }
`;

const BackFace = styled(CardFace)`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5);
  transform: rotateY(180deg);
  background: var(--color-secondary-100);
  color: var(--color-text);

  @media (prefers-reduced-motion: reduce) {
    transform: none;
    opacity: ${({ $flipped }) => ($flipped ? 1 : 0)};
    pointer-events: ${({ $flipped }) => ($flipped ? "auto" : "none")};
  }
`;

const CardIdentity = styled.div`
  display: grid;
  gap: 2px;

  strong {
    color: var(--color-white);
    font-size: var(--font-size-200);
    font-weight: 650;
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
    word-break: keep-all;
    overflow-wrap: break-word;
    text-wrap: pretty;
  }

  small {
    color: rgb(var(--color-white-rgb) / 0.82);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const CardPhrase = styled.span`
  font-size: var(--font-size-300);
  font-weight: 600;
  line-height: var(--line-height-subtitle);
  letter-spacing: var(--letter-spacing-subtitle);
  word-break: keep-all;
  overflow-wrap: break-word;
  text-wrap: pretty;
`;

const CardHint = styled.em`
  width: fit-content;
  margin-top: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border: 1px solid rgb(var(--color-white-rgb) / 0.34);
  border-radius: 999px;
  background: rgb(var(--color-black-rgb) / 0.42);
  color: rgb(var(--color-white-rgb) / 0.9);
  font-size: calc(var(--font-size-100) - 1px);
  font-style: normal;
  font-weight: 500;
  line-height: var(--line-height-body);
`;

const BackHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
`;

const BackIdentity = styled.div`
  min-width: 0;
  display: grid;
  gap: var(--space-1);

  > span {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-secondary-900);
    font-size: var(--font-size-100);
    font-weight: 650;
  }

  strong {
    font-size: var(--font-size-300);
    line-height: var(--line-height-subtitle);
    word-break: keep-all;
    text-wrap: balance;
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const TurnBackButton = styled(BaseButton)`
  min-height: var(--space-9);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 0 0 auto;
  padding: 0 var(--space-3);
  border: 1px solid color-mix(in srgb, var(--color-secondary-700) 24%, transparent);
  border-radius: 999px;
  background: rgb(var(--color-white-rgb) / 0.62);
  color: var(--color-text-muted);
  font-size: calc(var(--font-size-100) - 1px);

  svg { width: 13px; height: 13px; }
`;

const ActionCopy = styled.div`
  display: grid;
  gap: var(--space-3);

  strong {
    max-width: 14em;
    font-size: clamp(var(--font-size-300), 2.4cqh, var(--font-size-500));
    font-weight: 700;
    line-height: 1.34;
    word-break: keep-all;
    text-wrap: balance;
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
    word-break: keep-all;
  }
`;

const ActionLoading = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const BackActions = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const DepartureButton = styled(Button)`
  width: 100%;
`;

const SecondaryActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
`;

const QuietButton = styled(Button)`
  min-width: 0;
  min-height: var(--space-10);
  padding-inline: var(--space-2);
  border-color: color-mix(in srgb, var(--color-secondary-700) 20%, transparent);
  background: rgb(var(--color-white-rgb) / 0.68);
  font-size: calc(var(--font-size-100) - 1px);
`;
