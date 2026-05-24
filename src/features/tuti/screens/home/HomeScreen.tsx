"use client";

import styled from "@emotion/styled";
import { AmbientCard } from "@/features/tuti/components/AmbientCard";
import { PrimaryButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { StateFeature, TutiPlace } from "@/lib/recommendations";

export function HomeScreen({
  place,
  feature,
  onEnterSwipe,
  requestingLocation = false,
}: {
  place?: TutiPlace;
  feature: StateFeature;
  onEnterSwipe: () => void;
  requestingLocation?: boolean;
}) {
  return (
    <Frame>
      <AmbientCard place={place} quiet />
      <Copy>
        <p>
          {place?.reason ??
            (feature.energy === "low"
              ? "멀리 안 가도 괜찮아요."
              : "반나절 정도면 충분할지도 몰라요.")}
        </p>
        <h2>생각 안 해도 되게 준비했어요.</h2>
      </Copy>
      <PrimaryButton onClick={onEnterSwipe} disabled={requestingLocation}>
        {requestingLocation ? "가까운 공기를 보고 있어요" : "오늘 가능한 곳 보기"}
      </PrimaryButton>
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  justify-content: flex-end;
  gap: 22px;
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
    max-width: 280px;
    font-size: 29px;
    line-height: 1.24;
    letter-spacing: 0;
  }
`;
