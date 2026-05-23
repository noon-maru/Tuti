"use client";

import styled from "@emotion/styled";
import { BackButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { TutiPlace } from "@/lib/recommendations";

export function JournalScreen({ places, onBack }: { places: TutiPlace[]; onBack: () => void }) {
  return (
    <Frame>
      <BackButton onClick={onBack}>돌아가기</BackButton>
      <Header>
        <p>나의 기록</p>
        <h2>지나간 공기</h2>
      </Header>
      <MemoryList>
        {places.map((place) => (
          <MemoryCard key={place.id}>
            <MemoryImage $image={place.image} />
            <p>{place.phrase}</p>
            <span>오늘은 이 정도면 충분했어요.</span>
          </MemoryCard>
        ))}
      </MemoryList>
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  gap: 22px;
`;

const Header = styled.div`
  display: grid;
  gap: 8px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    font-size: 30px;
    letter-spacing: 0;
  }
`;

const MemoryList = styled.div`
  display: grid;
  gap: 14px;
  overflow-y: auto;
  padding-right: 2px;
`;

const MemoryCard = styled.article`
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 14px;
  align-items: center;
  min-height: 116px;
  padding: 10px;
  border: 1px solid rgba(31, 33, 29, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);

  p {
    font-weight: 800;
    line-height: 1.45;
  }

  span {
    grid-column: 2;
    color: #777469;
    font-size: 13px;
    line-height: 1.5;
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
