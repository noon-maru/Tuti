"use client";
import styled from "@emotion/styled";
import { ChevronDown } from "lucide-react";
import { BaseButton } from "./buttons";
import { DogOutingControls } from "./DogOutingControls";
import type { DogOuting } from "@/shared/pets/dogAccess";
import type { BudgetAnswer, CompanionAnswer } from "@/shared/tuti/types";

const companions = [{ value: "solo", label: "혼자" }, { value: "friend", label: "친구와" }, { value: "partner", label: "연인과" }, { value: "family", label: "가족과" }] as const;
const budgets = [{ value: "free", label: "입장료 무료" }, { value: "under_20000", label: "입장료 2만원 안쪽" }] as const;

/** One optional disclosure, shared by first intake and the return check-in. */
export function ExplorePreferences({ withDog, dogOuting, onDogOutingChange, onDogValidityChange, dogConditionsValid = true, companion, budget, onCompanionChange, onBudgetChange }: {
  dogConditionsValid?: boolean;
  withDog: boolean; dogOuting?: DogOuting; onDogOutingChange?: (value?: DogOuting) => void; onDogValidityChange?: (valid: boolean) => void;
  companion?: CompanionAnswer; budget?: BudgetAnswer; onCompanionChange: (value?: CompanionAnswer) => void; onBudgetChange: (value?: BudgetAnswer) => void;
}) {
  const preparationCount = dogOuting ? [dogOuting.leash, dogOuting.carrier, dogOuting.muzzle].filter(value => value !== null && value !== undefined).length : 0;
  const labels = [withDog && dogOuting?.weightsKg.length ? `${dogOuting.weightsKg.join(", ")}kg` : null,
    withDog && dogOuting?.space && dogOuting.space !== "any" ? dogOuting.space === "indoor" ? "실내" : "야외·테라스" : null,
    withDog && preparationCount ? `준비물 ${preparationCount}개 설정` : null,
    companions.find(option => option.value === companion)?.label, budgets.find(option => option.value === budget)?.label].filter(Boolean);
  return <Fold>
    <summary><div><strong>조금 더 맞추기 <small>선택</small></strong><span>{withDog && !dogConditionsValid ? "몸무게 입력을 확인해주세요" : labels.length ? labels.join(" · ") : withDog ? "반려견 조건 · 동행 · 입장료" : "동행 · 입장료"}</span></div><ChevronDown size={18} aria-hidden="true" /></summary>
    <Body>
      {withDog && onDogOutingChange && <DogOutingControls value={dogOuting} onChange={onDogOutingChange} onValidityChange={onDogValidityChange} />}
      <Group><legend>함께 갈 사람</legend><Choices>{companions.map(option => <Choice key={option.value} type="button" $active={companion === option.value} aria-pressed={companion === option.value} onClick={() => onCompanionChange(companion === option.value ? undefined : option.value)}>{option.label}</Choice>)}</Choices></Group>
      <Group><legend>입장료</legend><Choices>{budgets.map(option => <Choice key={option.value} type="button" $active={budget === option.value} aria-pressed={budget === option.value} onClick={() => onBudgetChange(budget === option.value ? undefined : option.value)}>{option.label}</Choice>)}</Choices></Group>
    </Body>
  </Fold>;
}

const Fold = styled.details`min-width: 0; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); > summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; padding: 12px 0; list-style: none; cursor: pointer; } > summary::-webkit-details-marker { display: none; } summary > div { display: grid; min-width: 0; gap: 4px; } strong { font-size: 14px; font-weight: 500; line-height: 1.6; } small { margin-left: 6px; color: var(--color-text-muted); font-size: 12px; font-weight: 400; } summary span { color: var(--color-text-muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; } summary > svg { flex: none; color: var(--color-text-muted); transition: transform 180ms ease; } &[open] > summary > svg { transform: rotate(180deg); } summary:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -2px; border-radius: 6px; } @media (prefers-reduced-motion: reduce) { summary > svg { transition: none; } }`;
const Body = styled.div`display: grid; gap: 24px; padding: 12px 0 24px; > [data-dog-controls] { padding-bottom: 24px; border-bottom: 1px solid var(--color-border); }`;
const Group = styled.fieldset`min-width: 0; margin: 0; padding: 0; border: 0; legend { padding: 0; margin-bottom: 10px; font-size: 14px; font-weight: 600; line-height: 1.6; }`;
const Choices = styled.div`display: flex; flex-wrap: wrap; gap: 8px;`;
const Choice = styled(BaseButton)<{ $active: boolean }>`min-height: 44px; padding: 8px 14px; border: 1px solid ${({ $active }) => $active ? "var(--color-brand-700)" : "var(--color-border)"}; border-radius: 999px; background: ${({ $active }) => $active ? "var(--color-brand-100)" : "var(--color-surface)"}; color: ${({ $active }) => $active ? "var(--color-brand-1000)" : "var(--color-text-muted)"}; font-size: 13px; font-weight: 500; line-height: 1.6;`;
