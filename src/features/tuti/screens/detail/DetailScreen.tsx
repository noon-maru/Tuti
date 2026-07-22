"use client";

import styled from "@emotion/styled";
import { AmbientCard } from "@/features/tuti/components/AmbientCard";
import { BackButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import type { TutiPlace } from "@/lib/recommendations";

export function DetailScreen({
  place,
  onBack,
}: {
  place: TutiPlace;
  onBack: () => void;
}) {
  const swipeBack = useVerticalSwipeBack({ direction: "down", onBack });

  return (
    <Frame
      {...swipeBack.gestureProps}
      $dragY={swipeBack.dragY}
      $progress={swipeBack.dragProgress}
      $isDragging={swipeBack.isDragging}
      $isCommitting={swipeBack.isCommitting}
    >
      <BackButton onClick={onBack}>돌아가기</BackButton>
      <AmbientCard place={place} />
      <Copy>
        <p>{place.name}</p>
        <h2>{place.phrase}</h2>
        {place.reason && <small>{place.reason}</small>}
        <span>{place.note}</span>
      </Copy>
      <InfoRows>
        <InfoRow label="이동시간" value={place.travelTime} />
        <InfoRow label="혼잡도" value={place.crowd} />
        <InfoRow label="오늘" value={place.today} />
      </InfoRows>
    </Frame>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <InfoRowFrame>
      <span>{label}</span>
      <strong>{value}</strong>
    </InfoRowFrame>
  );
}

const Frame = styled(ScreenFrame)<{
  $dragY: number;
  $progress: number;
  $isDragging: boolean;
  $isCommitting: boolean;
}>`
  z-index: 1;
  gap: var(--space-5);
  background: var(--color-surface);
  opacity: ${({ $progress }) => 1 - $progress * 0.32};
  transform: translateY(${({ $dragY }) => $dragY}px)
    scale(${({ $progress }) => 1 - $progress * 0.025});
  transition: ${({ $isDragging }) =>
    $isDragging ? "none" : "opacity 160ms ease, transform 180ms ease"};
  overflow-y: auto;
  overscroll-behavior-y: contain;
  touch-action: none;
`;

const Copy = styled.div`
  display: grid;
  gap: var(--space-2);

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  h2 {
    font-size: var(--font-size-600);
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const InfoRows = styled.div`
  display: grid;
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--color-border);
`;

const InfoRowFrame = styled.div`
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  background: var(--color-surface);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  strong {
    font-size: var(--font-size-200);
  }
`;
