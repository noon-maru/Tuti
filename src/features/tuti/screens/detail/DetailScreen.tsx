"use client";

import styled from "@emotion/styled";
import { AmbientCard } from "@/features/tuti/components/AmbientCard";
import { BackButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import {
  SwipeReturnBackdrop,
  type SwipeReturnBackdropProps,
} from "@/features/tuti/screens/swipe/SwipeReturnBackdrop";
import type { TutiPlace } from "@/lib/recommendations";

export function DetailScreen({
  place,
  onBack,
  swipeBackdrop,
}: {
  place: TutiPlace;
  onBack: () => void;
  swipeBackdrop?: SwipeReturnBackdropProps;
}) {
  const swipeBack = useVerticalSwipeBack({ direction: "down", onBack });

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
    </>
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
  gap: 20px;
  background: #fbfaf6;
  opacity: ${({ $progress }) => 1 - $progress * 0.32};
  transform: translateY(${({ $dragY }) => $dragY}px)
    scale(${({ $progress }) => 1 - $progress * 0.025});
  transition: ${({ $isDragging }) =>
    $isDragging ? "none" : "opacity 160ms ease, transform 180ms ease"};
  touch-action: none;
`;

const Copy = styled.div`
  display: grid;
  gap: 8px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    font-size: 28px;
    line-height: 1.25;
    letter-spacing: 0;
  }

  span {
    color: #68665d;
    font-size: 15px;
    line-height: 1.7;
  }

  small {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }
`;

const InfoRows = styled.div`
  display: grid;
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(31, 33, 29, 0.08);
`;

const InfoRowFrame = styled.div`
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.64);

  span {
    color: #777469;
    font-size: 14px;
  }

  strong {
    font-size: 15px;
  }
`;
