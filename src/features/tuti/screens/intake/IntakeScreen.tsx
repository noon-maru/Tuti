"use client";

import styled from "@emotion/styled";
import { BaseButton, SkipButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { IntakeStep } from "@/features/tuti/data/intakeSteps";

export function IntakeScreen({
  step,
  total,
  activeStep,
  onChoose,
  onReset,
}: {
  step: number;
  total: number;
  activeStep: IntakeStep;
  onChoose: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <Frame>
      <SoftHeader>
        <span>Tuti</span>
        <SkipButton onClick={onReset}>다시</SkipButton>
      </SoftHeader>
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
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  gap: var(--space-9);
`;

const SoftHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  span {
    font-size: var(--font-size-600);
    font-weight: 700;
  }
`;

const QuestionBlock = styled.div`
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-9);

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
  gap: var(--space-4);
`;

const OptionCard = styled(BaseButton)`
  min-height: 82px;
  display: grid;
  gap: var(--space-2);
  justify-items: start;
  padding: var(--space-5);
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
