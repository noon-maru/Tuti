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
  onChoose,
  onRestoreRecords,
  onSkip,
}: {
  step: number;
  total: number;
  activeStep: IntakeStep;
  accountNoticeVisible: boolean;
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
        <p>
          {step + 1} / {total}
        </p>
        <h2>{activeStep.question}</h2>
      </QuestionBlock>
      <OptionList>
        {activeStep.options.map((option) => (
          <OptionCard key={option.value} onClick={() => onChoose(option.value)}>
            <span>{option.label}</span>
            <small>{option.hint}</small>
          </OptionCard>
        ))}
      </OptionList>
      <BrowseButton onClick={onSkip}>질문 없이 바로 둘러보기</BrowseButton>
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  gap: var(--space-5);
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
  gap: var(--space-3);
  padding-top: var(--space-3);

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  h2 {
    max-width: 290px;
    font-size: var(--font-size-600);
  }
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
