"use client";

import styled from "@emotion/styled";
import { BaseButton } from "@/features/tuti/components/buttons";
import type {
  BudgetAnswer,
  CompanionAnswer,
} from "@/shared/tuti/types";

const companionOptions: Array<{
  value: CompanionAnswer;
  label: string;
}> = [
  { value: "solo", label: "혼자" },
  { value: "friend", label: "친구와" },
  { value: "partner", label: "연인과" },
  { value: "family", label: "가족과" },
];

const budgetOptions: Array<{ value: BudgetAnswer; label: string }> = [
  { value: "free", label: "입장료 무료" },
  { value: "under_20000", label: "입장료 2만원 안쪽" },
];

export function AuxiliaryConditions({
  companion,
  budget,
  onCompanionChange,
  onBudgetChange,
}: {
  companion?: CompanionAnswer;
  budget?: BudgetAnswer;
  onCompanionChange: (value?: CompanionAnswer) => void;
  onBudgetChange: (value?: BudgetAnswer) => void;
}) {
  return (
    <Panel>
      <summary>조금 더 맞추기 <small>선택</small></summary>
      <Fields>
        <Condition>
          <span>누구와 가나요?</span>
          <Chips>
            {companionOptions.map((option) => (
              <Chip
                key={option.value}
                type="button"
                $active={companion === option.value}
                aria-pressed={companion === option.value}
                onClick={() =>
                  onCompanionChange(
                    companion === option.value ? undefined : option.value,
                  )
                }
              >
                {option.label}
              </Chip>
            ))}
          </Chips>
        </Condition>
        <Condition>
          <span>입장 비용도 맞출까요?</span>
          <Chips>
            {budgetOptions.map((option) => (
              <Chip
                key={option.value}
                type="button"
                $active={budget === option.value}
                aria-pressed={budget === option.value}
                onClick={() =>
                  onBudgetChange(
                    budget === option.value ? undefined : option.value,
                  )
                }
              >
                {option.label}
              </Chip>
            ))}
          </Chips>
        </Condition>
        <Hint>선택하지 않아도 추천받을 수 있어요.</Hint>
      </Fields>
    </Panel>
  );
}

const Panel = styled.details`
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-surface);

  summary {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 700;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::after {
    content: "+";
    float: right;
    font-size: var(--font-size-200);
  }

  &[open] summary::after {
    content: "−";
  }

  small {
    margin-left: var(--space-1);
    color: var(--color-brand-700);
  }
`;

const Fields = styled.div`
  display: grid;
  gap: var(--space-4);
  padding: 0 var(--space-4) var(--space-4);
`;

const Condition = styled.div`
  display: grid;
  gap: var(--space-2);

  > span {
    font-size: var(--font-size-100);
    font-weight: 700;
  }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
`;

const Chip = styled(BaseButton)<{ $active: boolean }>`
  min-height: 38px;
  padding: 0 var(--space-3);
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--color-brand-700)" : "var(--color-border)"};
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-200)" : "var(--color-surface)"};
  color: ${({ $active }) =>
    $active ? "var(--color-brand-800)" : "var(--color-text-muted)"};
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const Hint = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-050);
`;
