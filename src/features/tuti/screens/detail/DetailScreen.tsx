"use client";

import styled from "@emotion/styled";
import { BaseButton } from "@/features/tuti/components/buttons";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import type { TutiPlace } from "@/lib/recommendations";
import { fluidByViewportHeight } from "@/styles/tokens";

const DETAIL_EXIT_DURATION = 480;
const DETAIL_EXIT_FRAME_BUFFER = 34;

export function DetailScreen({
  place,
  onBack,
  onExitStart,
  revealProgress = 1,
}: {
  place: TutiPlace;
  onBack: () => void;
  onExitStart?: () => void;
  revealProgress?: number;
}) {
  const swipeBack = useVerticalSwipeBack({
    direction: "down",
    onBack,
    onExitStart,
    exitDelay: DETAIL_EXIT_DURATION + DETAIL_EXIT_FRAME_BUFFER,
  });

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
          <Tags aria-label="장소 정보">
            <Tag $tone="brand">{place.travelTime}</Tag>
            <Tag $tone="neutral">혼잡도 {place.crowd}</Tag>
            <Tag $tone="secondary">{place.today}</Tag>
          </Tags>

          <Heading>
            <h1>{place.name}</h1>
            <MoreMenu aria-hidden="true">
              <i />
              <i />
              <i />
            </MoreMenu>
          </Heading>

          <Description data-scroll-region>
            <strong>{place.phrase}</strong>
            <p>{place.note}</p>
            {place.reason && <small>{place.reason}</small>}
          </Description>
        </Content>
      </Sheet>
    </Frame>
  );
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
  gap: var(--space-5);
  opacity: ${({ $revealProgress }) =>
    Math.max(0, Math.min(($revealProgress - 0.68) / 0.32, 1))};
  transform: translateY(
    ${({ $revealProgress }) =>
      (1 - Math.max(0, Math.min(($revealProgress - 0.68) / 0.32, 1))) * 12}px
  );
`;

const Tags = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
`;

const Tag = styled.span<{ $tone: "brand" | "neutral" | "secondary" }>`
  min-width: 0;
  min-height: 24px;
  display: grid;
  place-items: center;
  padding: var(--space-1) var(--space-2);
  overflow: hidden;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-500)"
      : $tone === "secondary"
        ? "var(--color-secondary-500)"
        : "var(--color-neutral-500)"};
  color: var(--color-text);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Heading = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);

  h1 {
    min-width: 0;
    font-size: var(--font-size-500);
    font-weight: 700;
  }
`;

const MoreMenu = styled.span`
  width: var(--space-7);
  height: var(--space-7);
  flex: 0 0 auto;
  display: grid;
  align-content: center;
  justify-content: center;
  gap: 2px;
  padding: 0;
  border-radius: 999px;
  background: transparent;

  i {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-text);
  }

`;

const Description = styled.div`
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-3);
  overflow-y: auto;
  overscroll-behavior-y: contain;
  touch-action: pan-y;

  strong {
    font-size: var(--font-size-200);
    font-weight: 600;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  p,
  small {
    color: var(--color-text-muted);
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
  }

  p {
    font-size: var(--font-size-200);
  }

  small {
    font-size: var(--font-size-100);
  }
`;
