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
  gap: 36px;
`;

const SoftHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  span {
    font-size: 22px;
    font-weight: 800;
  }
`;

const QuestionBlock = styled.div`
  display: grid;
  gap: 12px;
  padding-top: 36px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    max-width: 290px;
    font-size: 28px;
    line-height: 1.24;
    letter-spacing: 0;
  }
`;

const OptionList = styled.div`
  display: grid;
  gap: 14px;
`;

const OptionCard = styled(BaseButton)`
  min-height: 82px;
  display: grid;
  gap: 7px;
  justify-items: start;
  padding: 20px;
  border: 1px solid rgba(31, 33, 29, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: #23251f;
  text-align: left;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;

  &:hover {
    border-color: rgba(31, 33, 29, 0.28);
    background: rgba(255, 255, 255, 0.9);
  }

  &:active {
    transform: scale(0.98);
  }

  span {
    font-size: 18px;
    font-weight: 750;
  }

  small {
    color: #777469;
    font-size: 13px;
  }
`;
