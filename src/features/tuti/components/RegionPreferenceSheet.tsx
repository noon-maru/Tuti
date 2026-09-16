"use client";

import styled from "@emotion/styled";
import { ChevronLeft, MapPinned } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { fetchRecommendationRegions } from "@/lib/tutiApi";
import type { RecommendationRegionOption } from "@/shared/api/recommendationRegions";
import type { PreferredRegion } from "@/shared/tuti/types";

export function RegionPreferenceSheet({
  initialRegion,
  onComplete,
  onDismiss,
}: {
  initialRegion?: PreferredRegion;
  onComplete: (region: PreferredRegion) => void;
  onDismiss?: () => void;
}) {
  const animationReady = useDeferredAnimationStart();
  const [regions, setRegions] = useState<RecommendationRegionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAreaCode, setSelectedAreaCode] = useState(
    initialRegion?.areaCode,
  );
  const [selectedDistrictName, setSelectedDistrictName] = useState(
    initialRegion?.sigunguName,
  );

  const loadRegions = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchRecommendationRegions()
      .then(({ regions: nextRegions }) => setRegions(nextRegions))
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "추천받을 지역을 불러오지 못했어요.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;

    void fetchRecommendationRegions()
      .then(({ regions: nextRegions }) => {
        if (active) setRegions(nextRegions);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "추천받을 지역을 불러오지 못했어요.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedRegion = useMemo(
    () => regions.find((region) => region.areaCode === selectedAreaCode),
    [regions, selectedAreaCode],
  );
  const selectedDistrict = selectedRegion?.districts.find(
    (district) => district.name === selectedDistrictName,
  );
  const choosingDistrict = Boolean(selectedAreaCode);

  return (
    <Overlay
      $visible={animationReady}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      <Sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-preference-title"
        $visible={animationReady}
        onClick={(event) => event.stopPropagation()}
      >
        <Handle aria-hidden="true"><i /></Handle>
        <Heading>
          {choosingDistrict ? (
            <BackButton
              type="button"
              aria-label="시·도 다시 고르기"
              onClick={() => {
                setSelectedAreaCode(undefined);
                setSelectedDistrictName(undefined);
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </BackButton>
          ) : (
            <LocationMark aria-hidden="true"><MapPinned /></LocationMark>
          )}
          <h2 id="region-preference-title">
            {choosingDistrict
              ? `${selectedRegion?.shortName ?? "이 지역"} 어디쯤을 볼까요?`
              : "어느 쪽의 공기를 만나볼까요?"}
          </h2>
        </Heading>

        {loading ? (
          <StateArea>
            <LoadingIndicator label="고를 수 있는 지역을 살펴보고 있어요." compact />
          </StateArea>
        ) : error ? (
          <StateArea role="alert">
            <p>{error}</p>
            <RetryButton type="button" onClick={loadRegions}>
              다시 불러오기
            </RetryButton>
          </StateArea>
        ) : choosingDistrict ? (
          <DistrictList aria-label="추천받을 시·군·구">
            {selectedRegion?.districts.map((district) => (
              <RegionButton
                key={`${selectedRegion.areaCode}-${district.name}`}
                type="button"
                aria-pressed={selectedDistrictName === district.name}
                $selected={selectedDistrictName === district.name}
                onClick={() => setSelectedDistrictName(district.name)}
              >
                {district.name}
              </RegionButton>
            ))}
          </DistrictList>
        ) : (
          <RegionList aria-label="추천받을 시·도">
            {regions.map((region) => (
              <RegionButton
                key={region.areaCode}
                type="button"
                aria-pressed={false}
                $selected={false}
                onClick={() => {
                  setSelectedAreaCode(region.areaCode);
                  setSelectedDistrictName(undefined);
                }}
              >
                {region.shortName}
              </RegionButton>
            ))}
          </RegionList>
        )}

        {choosingDistrict && !loading && !error && (
          <ConfirmButton
            type="button"
            disabled={!selectedRegion || !selectedDistrict}
            onClick={() => {
              if (!selectedRegion || !selectedDistrict) return;
              onComplete({
                areaCode: selectedRegion.areaCode,
                name: selectedRegion.name,
                sigunguCode: selectedDistrict.code,
                sigunguName: selectedDistrict.name,
              });
            }}
          >
            {selectedDistrict
              ? `${selectedDistrict.name}에서 골라보기`
              : "동네를 골라주세요"}
          </ConfirmButton>
        )}
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
  min-height: var(--space-12);
  display: flex;
  align-items: center;
  gap: var(--space-3);

  h2 {
    min-width: 0;
    font-size: var(--font-size-500);
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

const BackButton = styled(BaseButton)`
  width: var(--space-12);
  height: var(--space-12);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--color-neutral-200);
  color: var(--color-text);

  svg {
    width: 22px;
    height: 22px;
  }
`;

const RegionList = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
`;

const DistrictList = styled(RegionList)`
  grid-template-columns: repeat(3, minmax(0, 1fr));
`;

const RegionButton = styled(BaseButton)<{ $selected: boolean }>`
  min-height: 44px;
  padding: var(--space-2);
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

const ConfirmButton = styled(PrimaryButton)`
  min-height: 52px;
  border-radius: 18px;
`;

const StateArea = styled.div`
  min-height: 180px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
`;

const RetryButton = styled(BaseButton)`
  min-height: 42px;
  padding-inline: var(--space-4);
  border: 1px solid var(--color-secondary-500);
  border-radius: 14px;
  background: var(--color-secondary-100);
  color: var(--color-secondary-1000);
  font-weight: 600;
`;
