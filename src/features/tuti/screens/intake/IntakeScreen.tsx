"use client";

import styled from "@emotion/styled";
import { BaseButton, TextButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { IntakeStep } from "@/features/tuti/data/intakeSteps";

export function IntakeScreen({
  step,
  total,
  activeStep,
  accountNoticeVisible,
  onBack,
  onChoose,
  onRestoreRecords,
  onSkip,
}: {
  step: number;
  total: number;
  activeStep: IntakeStep;
  accountNoticeVisible: boolean;
  onBack: () => void;
  onChoose: (value: string) => void;
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
        <MovementScale>
          <ScaleTrack aria-hidden="true" />
          {activeStep.options.map((option, index) => (
            <ScaleOption
              key={option.value}
              type="button"
              aria-label={`${option.label}, ${option.hint}`}
              onClick={() => onChoose(option.value)}
            >
              <ScalePoint $level={index} data-scale-point aria-hidden="true" />
              <span>{option.label}</span>
              <small>{option.hint}</small>
            </ScaleOption>
          ))}
        </MovementScale>
      ) : (
        <OptionList>
          {activeStep.options.map((option) => (
            <OptionCard
              key={option.value}
              type="button"
              onClick={() => onChoose(option.value)}
            >
              <span>{option.label}</span>
              <small>{option.hint}</small>
            </OptionCard>
          ))}
        </OptionList>
      )}
      <BrowseButton onClick={onSkip}>질문 없이 바로 둘러보기</BrowseButton>
    </Frame>
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
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
`;

const ScaleTrack = styled.div`
  position: absolute;
  top: 23px;
  right: calc(100% / 6);
  left: calc(100% / 6);
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--color-secondary-200),
    var(--color-secondary-500),
    var(--color-brand-500)
  );
`;

const ScaleOption = styled(BaseButton)`
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 132px;
  display: grid;
  grid-template-rows: 48px auto auto;
  align-content: start;
  justify-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-3);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  text-align: center;
  transition: transform 180ms ease;

  &:hover [data-scale-point] {
    transform: scale(1.16);
    box-shadow:
      0 0 0 4px var(--color-brand-100),
      0 0 0 5px var(--color-brand-500);
  }

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

const ScalePoint = styled.i<{ $level: number }>`
  width: ${({ $level }) => 16 + $level * 6}px;
  height: ${({ $level }) => 16 + $level * 6}px;
  align-self: center;
  border: 3px solid var(--color-surface);
  border-radius: 50%;
  background: ${({ $level }) =>
    $level === 0
      ? "var(--color-secondary-200)"
      : $level === 1
        ? "var(--color-secondary-500)"
        : "var(--color-brand-500)"};
  box-shadow: 0 0 0 1px var(--color-border);
  transition: box-shadow 180ms ease, transform 180ms ease;
`;

const OptionList = styled.div`
  display: grid;
  gap: var(--space-3);
`;

const OptionCard = styled(BaseButton)`
  min-height: 72px;
  display: grid;
  gap: var(--space-2);
  justify-items: start;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
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

const BrowseButton = styled(TextButton)`
  margin-top: auto;
  align-self: center;
`;
