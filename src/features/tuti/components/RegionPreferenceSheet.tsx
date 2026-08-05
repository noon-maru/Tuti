"use client";

import styled from "@emotion/styled";
import { MapPinned } from "lucide-react";
import { useState } from "react";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { tourApiSidoOptions } from "@/shared/tourism/tourApiRegions";
import type { PreferredRegion } from "@/shared/tuti/types";

const regionLabels: Record<string, string> = {
  "1": "서울",
  "2": "인천",
  "3": "대전",
  "4": "대구",
  "5": "광주",
  "6": "부산",
  "7": "울산",
  "8": "세종",
  "31": "경기",
  "32": "강원",
  "33": "충북",
  "34": "충남",
  "35": "경북",
  "36": "경남",
  "37": "전북",
  "38": "전남",
  "39": "제주",
};

export function RegionPreferenceSheet({
  initialRegion,
  onComplete,
}: {
  initialRegion?: PreferredRegion;
  onComplete: (region?: PreferredRegion) => void;
}) {
  const animationReady = useDeferredAnimationStart();
  const [selectedAreaCode, setSelectedAreaCode] = useState(
    initialRegion?.areaCode,
  );
  const selectedRegion = tourApiSidoOptions.find(
    ([areaCode]) => areaCode === selectedAreaCode,
  );

  return (
    <Overlay $visible={animationReady}>
      <Sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-preference-title"
        $visible={animationReady}
      >
        <Handle aria-hidden="true"><i /></Handle>
        <Heading>
          <LocationMark aria-hidden="true"><MapPinned /></LocationMark>
          <div>
            <h2 id="region-preference-title">어느 쪽의 공기를 만나볼까요?</h2>
            <p>
              현재 위치 대신 고른 지역 안에서 오늘 부담이 낮은 장소를
              찾아볼게요.
            </p>
          </div>
        </Heading>

        <RegionList aria-label="추천받을 지역">
          {tourApiSidoOptions.map(([areaCode, name]) => (
            <RegionButton
              key={areaCode}
              type="button"
              aria-pressed={selectedAreaCode === areaCode}
              $selected={selectedAreaCode === areaCode}
              onClick={() => setSelectedAreaCode(areaCode)}
            >
              {regionLabels[areaCode] ?? name}
            </RegionButton>
          ))}
        </RegionList>

        <Actions>
          <ConfirmButton
            type="button"
            disabled={!selectedRegion}
            onClick={() => {
              if (!selectedRegion) return;
              onComplete({
                areaCode: selectedRegion[0],
                name: selectedRegion[1],
              });
            }}
          >
            {selectedRegion
              ? `${regionLabels[selectedRegion[0]] ?? selectedRegion[1]}에서 골라보기`
              : "지역을 골라주세요"}
          </ConfirmButton>
          <SkipButton type="button" onClick={() => onComplete()}>
            지역 상관없이 둘러보기
          </SkipButton>
        </Actions>
      </Sheet>
    </Overlay>
  );
}

const Overlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  z-index: 71;
  inset: 0;
  display: grid;
  align-items: end;
  background: rgb(var(--color-black-rgb) / 0.28);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 380ms ease;
`;

const Sheet = styled.section<{ $visible: boolean }>`
  width: 100%;
  max-height: calc(100% - var(--app-safe-area-top, 0px) - var(--space-5));
  display: grid;
  gap: var(--space-5);
  padding: 0 var(--space-5)
    calc(var(--space-6) + var(--app-safe-area-bottom, 0px));
  overflow-y: auto;
  border-radius: 30px 30px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -18px 56px rgb(var(--color-black-rgb) / 0.2);
  transform: translateY(${({ $visible }) => ($visible ? "0" : "calc(100% + 32px)")});
  transition: transform 380ms cubic-bezier(0.22, 1, 0.36, 1);

  @supports (corner-shape: squircle) {
    border-radius: 42px 42px 0 0;
    corner-shape: squircle;
  }
`;

const Handle = styled.div`
  width: 80px;
  height: 30px;
  display: grid;
  place-items: center;
  margin-inline: auto;

  i {
    width: 42px;
    height: 4px;
    border-radius: 999px;
    background: var(--color-neutral-500);
  }
`;

const Heading = styled.header`
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);

  > div:last-child {
    min-width: 0;
    display: grid;
    gap: var(--space-2);
  }

  h2 {
    font-size: var(--font-size-500);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const LocationMark = styled.div`
  width: var(--space-12);
  height: var(--space-12);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--color-secondary-200);
  color: var(--color-secondary-900);

  svg {
    width: 24px;
    height: 24px;
  }
`;

const RegionList = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
`;

const RegionButton = styled(BaseButton)<{ $selected: boolean }>`
  min-height: 44px;
  border: 1px solid
    ${({ $selected }) =>
      $selected ? "var(--color-secondary-700)" : "var(--color-border)"};
  border-radius: 14px;
  background: ${({ $selected }) =>
    $selected ? "var(--color-secondary-300)" : "var(--color-neutral-200)"};
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-weight: ${({ $selected }) => ($selected ? 600 : 500)};
`;

const Actions = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const ConfirmButton = styled(PrimaryButton)`
  min-height: 52px;
  border-radius: 18px;
`;

const SkipButton = styled(BaseButton)`
  min-height: 44px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;
