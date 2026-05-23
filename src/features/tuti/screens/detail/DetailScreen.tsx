"use client";

import styled from "@emotion/styled";
import { AmbientCard } from "@/features/tuti/components/AmbientCard";
import { BackButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { TutiPlace } from "@/lib/recommendations";

export function DetailScreen({ place, onBack }: { place: TutiPlace; onBack: () => void }) {
  return (
    <Frame>
      <BackButton onClick={onBack}>돌아가기</BackButton>
      <AmbientCard place={place} />
      <Copy>
        <p>{place.name}</p>
        <h2>{place.phrase}</h2>
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

const Frame = styled(ScreenFrame)`
  gap: 20px;
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
