"use client";

import styled from "@emotion/styled";
import { useRef, useState } from "react";
import {
  BaseButton,
  PrimaryButton,
  TextButton,
} from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { IntakeStep } from "@/features/tuti/data/intakeSteps";

type MovementStep = Extract<IntakeStep, { key: "movement" }>;

export function IntakeScreen({
  step,
  total,
  activeStep,
  selectedValue,
  accountNoticeVisible,
  onBack,
  onChoose,
  onNext,
  onRestoreRecords,
  onSkip,
}: {
  step: number;
  total: number;
  activeStep: IntakeStep;
  selectedValue?: string;
  accountNoticeVisible: boolean;
  onBack: () => void;
  onChoose: (value: string) => void;
  onNext: () => void;
  onRestoreRecords: () => void;
  onSkip: () => void;
}) {
  return (
    <Frame>
      <SoftHeader>
        <Brand>
          <strong>Tuti</strong>
          <span>오늘 가능한 만큼만, 잠깐 다른 공기로.</span>
        </Brand>
        <RestoreButton onClick={onRestoreRecords}>기록 불러오기</RestoreButton>
      </SoftHeader>
      {accountNoticeVisible && (
        <AccountNotice role="status">
          계정 연결은 준비 중이에요. 지금은 질문 없이도 둘러볼 수 있어요.
        </AccountNotice>
      )}
      <QuestionBlock>
        <QuestionNavigation>
          {step > 0 ? (
            <QuestionBackButton type="button" onClick={onBack}>
              <span aria-hidden="true">←</span>
              이전
            </QuestionBackButton>
          ) : (
            <BackButtonPlaceholder aria-hidden="true" />
          )}
          <StepCount>
            {step + 1} / {total}
          </StepCount>
        </QuestionNavigation>
        <h2>{activeStep.question}</h2>
        {"subtitle" in activeStep && (
          <QuestionSubtitle>{activeStep.subtitle}</QuestionSubtitle>
        )}
      </QuestionBlock>
      {activeStep.key === "movement" ? (
        <MovementSlider
          activeStep={activeStep}
          selectedValue={selectedValue}
          onChoose={onChoose}
        />
      ) : (
        <OptionList>
          {activeStep.options.map((option) => (
            <OptionCard
              key={option.value}
              $active={option.value === selectedValue}
              type="button"
              aria-pressed={option.value === selectedValue}
              onClick={() => onChoose(option.value)}
            >
              <span>{option.label}</span>
              <small>{option.hint}</small>
            </OptionCard>
          ))}
        </OptionList>
      )}
      <QuestionActions>
        <NextButton disabled={!selectedValue} onClick={onNext}>
          {step === total - 1 ? "장소 추천받기" : "다음"}
        </NextButton>
        <BrowseButton onClick={onSkip}>질문 없이 바로 둘러보기</BrowseButton>
      </QuestionActions>
    </Frame>
  );
}

function MovementSlider({
  activeStep,
  selectedValue,
  onChoose,
}: {
  activeStep: MovementStep;
  selectedValue?: string;
  onChoose: (value: string) => void;
}) {
  const selectedIndex = activeStep.options.findIndex(
    (option) => option.value === selectedValue,
  );
  const [sliderPosition, setSliderPosition] = useState(
    selectedIndex >= 0 ? selectedIndex : 1,
  );
  const [dragging, setDragging] = useState(false);
  const activeIndex = Math.round(sliderPosition);
  const activeOption = activeStep.options[activeIndex];
  const dragOriginRef = useRef(activeIndex);

  const chooseAt = (index: number) => {
    const option = activeStep.options[index];

    if (!option) return;

    setSliderPosition(index);
    onChoose(option.value);
  };

  const snapToClosestOption = (position: number) => {
    const origin = dragOriginRef.current;
    const distance = position - origin;
    const snapThreshold = 0.2;
    let target = origin;

    if (distance >= snapThreshold) {
      target = Math.max(origin + 1, Math.round(position));
    } else if (distance <= -snapThreshold) {
      target = Math.min(origin - 1, Math.round(position));
    }

    setDragging(false);
    chooseAt(
      Math.max(0, Math.min(activeStep.options.length - 1, target)),
    );
  };

  return (
    <MovementScale>
      <SliderControl>
        <ScaleTrack aria-hidden="true" />
        <ScaleTicks aria-hidden="true">
          {activeStep.options.map((option, index) => (
            <ScalePoint key={option.value} $level={index} />
          ))}
        </ScaleTicks>
        <SliderThumb
          $dragging={dragging}
          $level={activeIndex}
          $position={sliderPosition}
          aria-hidden="true"
        />
        <RangeInput
          type="range"
          min={0}
          max={activeStep.options.length - 1}
          step={0.01}
          value={sliderPosition}
          aria-label="오늘 이동할 수 있는 거리"
          aria-valuetext={`${activeOption.label}, ${activeOption.hint}`}
          onChange={(event) =>
            setSliderPosition(Number(event.currentTarget.value))
          }
          onPointerDown={() => {
            dragOriginRef.current = activeIndex;
            setDragging(true);
          }}
          onPointerUp={(event) =>
            snapToClosestOption(Number(event.currentTarget.value))
          }
          onPointerCancel={(event) =>
            snapToClosestOption(Number(event.currentTarget.value))
          }
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              chooseAt(Math.max(0, activeIndex - 1));
            }

            if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              chooseAt(
                Math.min(activeStep.options.length - 1, activeIndex + 1),
              );
            }
          }}
        />
      </SliderControl>
      <ScaleLabels>
        {activeStep.options.map((option, index) => (
          <ScaleOption
            key={option.value}
            $active={index === activeIndex}
            type="button"
            aria-pressed={index === activeIndex}
            aria-label={`${option.label}, ${option.hint}`}
            onClick={() => chooseAt(index)}
          >
            <span>{option.label}</span>
            <small>{option.hint}</small>
          </ScaleOption>
        ))}
      </ScaleLabels>
    </MovementScale>
  );
}

const Frame = styled(ScreenFrame)`
  gap: var(--space-5);
  overflow-y: auto;
  overscroll-behavior-y: contain;
`;

const SoftHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
`;

const Brand = styled.div`
  display: grid;
  gap: var(--space-1);

  strong {
    font-size: var(--font-size-600);
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
  }

  span {
    max-width: 180px;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const RestoreButton = styled(TextButton)`
  flex: none;
  padding: var(--space-1) 0;
`;

const AccountNotice = styled.p`
  padding: var(--space-3) var(--space-4);
  border-radius: 8px;
  background: var(--color-accent-soft);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const QuestionBlock = styled.div`
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-3);

  h2 {
    max-width: 320px;
    font-size: var(--font-size-600);
    white-space: pre-line;
  }
`;

const QuestionNavigation = styled.div`
  min-height: var(--space-11);
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const QuestionBackButton = styled(BaseButton)`
  min-width: 72px;
  min-height: var(--space-11);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: calc(var(--space-3) * -1);
  padding: 0 var(--space-3);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  transition: background 180ms ease, color 180ms ease, transform 180ms ease;

  &:hover {
    background: var(--color-neutral-200);
    color: var(--color-text);
  }

  &:active {
    transform: scale(0.96);
  }

  span {
    font-size: var(--font-size-300);
  }
`;

const BackButtonPlaceholder = styled.span`
  width: 72px;
  height: var(--space-11);
`;

const StepCount = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;

const QuestionSubtitle = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;

const MovementScale = styled.div`
  display: grid;
  gap: var(--space-1);
`;

const SliderControl = styled.div`
  position: relative;
  width: calc(100% * 2 / 3);
  height: var(--space-12);
  margin-inline: auto;
`;

const ScaleTrack = styled.div`
  position: absolute;
  top: 50%;
  right: 12px;
  left: 12px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--color-secondary-200),
    var(--color-secondary-500),
    var(--color-brand-500)
  );
  transform: translateY(-50%);
`;

const ScaleTicks = styled.div`
  position: absolute;
  top: 50%;
  right: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transform: translateY(-50%);
`;

const ScalePoint = styled.i<{ $level: number }>`
  width: 10px;
  height: 10px;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  background: ${({ $level }) =>
    $level === 0
      ? "var(--color-secondary-200)"
      : $level === 1
        ? "var(--color-secondary-500)"
        : "var(--color-brand-500)"};
  box-shadow: 0 0 0 1px var(--color-border);
`;

const SliderThumb = styled.i<{
  $dragging: boolean;
  $level: number;
  $position: number;
}>`
  position: absolute;
  z-index: 1;
  top: 50%;
  left: ${({ $position }) =>
    `calc(12px + (100% - 24px) * ${$position / 2})`};
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-surface);
  border-radius: 50%;
  background: ${({ $level }) =>
    $level === 0
      ? "var(--color-secondary-200)"
      : $level === 1
        ? "var(--color-secondary-500)"
        : "var(--color-brand-500)"};
  box-shadow:
    0 0 0 1px var(--color-border),
    0 4px 12px rgb(var(--color-black-rgb) / 0.16);
  pointer-events: none;
  transform: translate(-50%, -50%)
    scale(${({ $dragging }) => ($dragging ? 1.12 : 1)});
  transition: ${({ $dragging }) =>
    $dragging
      ? "background 180ms ease, transform 140ms ease"
      : "left 180ms ease-out, background 180ms ease, transform 140ms ease"};
`;

const RangeInput = styled.input`
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  appearance: none;
  background: transparent;
  cursor: grab;
  touch-action: pan-y;

  &:active {
    cursor: grabbing;
  }

  &::-webkit-slider-runnable-track {
    height: 8px;
    background: transparent;
  }

  &::-webkit-slider-thumb {
    width: 24px;
    height: 24px;
    margin-top: -8px;
    border: 0;
    appearance: none;
    background: transparent;
  }

  &::-moz-range-track {
    height: 8px;
    background: transparent;
  }

  &::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border: 0;
    background: transparent;
  }
`;

const ScaleLabels = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
`;

const ScaleOption = styled(BaseButton)<{ $active: boolean }>`
  min-width: 0;
  min-height: 76px;
  display: grid;
  align-content: start;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2) var(--space-3);
  border-radius: 8px;
  background: transparent;
  color: ${({ $active }) =>
    $active ? "var(--color-brand-800)" : "var(--color-text)"};
  text-align: center;
  transition: color 180ms ease, transform 180ms ease;

  &:hover span {
    color: var(--color-brand-800);
  }

  &:active {
    transform: scale(0.97);
  }

  span {
    font-size: var(--font-size-300);
    font-weight: 700;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const OptionList = styled.div`
  display: grid;
  gap: var(--space-3);
`;

const OptionCard = styled(BaseButton)<{ $active: boolean }>`
  min-height: 72px;
  display: grid;
  gap: var(--space-2);
  justify-items: start;
  padding: var(--space-4);
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--color-accent-secondary)" : "var(--color-border)"};
  border-radius: 8px;
  background: ${({ $active }) =>
    $active ? "var(--color-accent-soft)" : "var(--color-surface)"};
  color: var(--color-text);
  text-align: left;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;

  &:hover {
    border-color: var(--color-accent-secondary);
    background: var(--color-accent-soft);
  }

  &:active {
    transform: scale(0.98);
  }

  span {
    font-size: var(--font-size-400);
    font-weight: 700;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const QuestionActions = styled.div`
  display: grid;
  gap: var(--space-2);
  margin-top: auto;
`;

const NextButton = styled(PrimaryButton)`
  width: 100%;
`;

const BrowseButton = styled(TextButton)`
  align-self: center;
`;
