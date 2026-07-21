"use client";

import styled from "@emotion/styled";
import { BackButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import {
  SwipeReturnBackdrop,
  type SwipeReturnBackdropProps,
} from "@/features/tuti/screens/swipe/SwipeReturnBackdrop";
import type { TutiPlace } from "@/lib/recommendations";

export function JournalScreen({
  places,
  onBack,
  swipeBackdrop,
}: {
  places: TutiPlace[];
  onBack: () => void;
  swipeBackdrop?: SwipeReturnBackdropProps;
}) {
  const swipeBack = useVerticalSwipeBack({ direction: "up", onBack });

  return (
    <>
      {swipeBackdrop && (
        <SwipeReturnBackdrop {...swipeBackdrop} progress={swipeBack.dragProgress} />
      )}
      <Frame
        {...swipeBack.gestureProps}
        $dragY={swipeBack.dragY}
        $progress={swipeBack.dragProgress}
        $isDragging={swipeBack.isDragging}
        $isCommitting={swipeBack.isCommitting}
      >
        <BackButton onClick={onBack}>돌아가기</BackButton>
        <Header>
          <p>나의 기록</p>
          <h2>지나간 공기</h2>
        </Header>
        <MemoryList data-scroll-region>
          {places.map((place) => (
            <MemoryCard key={place.id}>
              <MemoryImage $image={place.image} />
              <p>{place.phrase}</p>
              <span>오늘은 이 정도면 충분했어요.</span>
            </MemoryCard>
          ))}
        </MemoryList>
      </Frame>
    </>
  );
}

const Frame = styled(ScreenFrame)<{
  $dragY: number;
  $progress: number;
  $isDragging: boolean;
  $isCommitting: boolean;
}>`
  z-index: 1;
  gap: var(--space-6);
  background: var(--color-surface);
  opacity: ${({ $progress }) => 1 - $progress * 0.32};
  transform: translateY(${({ $dragY }) => $dragY}px)
    scale(${({ $progress }) => 1 - $progress * 0.025});
  transition: ${({ $isDragging }) =>
    $isDragging ? "none" : "opacity 160ms ease, transform 180ms ease"};
  touch-action: none;
`;

const Header = styled.div`
  display: grid;
  gap: var(--space-2);

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  h2 {
    font-size: var(--font-size-600);
  }
`;

const MemoryList = styled.div`
  display: grid;
  gap: var(--space-4);
  overflow-y: auto;
  padding-right: 2px;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
`;

const MemoryCard = styled.article`
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: var(--space-4);
  align-items: center;
  min-height: 116px;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);

  p {
    font-weight: 700;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  span {
    grid-column: 2;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const MemoryImage = styled.div<{ $image: string }>`
  width: 96px;
  height: 96px;
  border-radius: 7px;
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
`;
