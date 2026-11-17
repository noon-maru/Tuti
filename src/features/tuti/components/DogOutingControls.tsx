"use client";
import { useId, useState } from "react";
import styled from "@emotion/styled";
import { parseDogOuting, type DogOuting } from "@/shared/pets/dogAccess";
import { BaseButton, TextButton } from "./buttons";
import { inputControlStyles } from "@/shared/ui/typography";

const preparations = [{ key: "leash", label: "목줄" }, { key: "carrier", label: "이동장" }, { key: "muzzle", label: "입마개" }] as const;
const spaces = [{ value: "any", label: "상관없어요" }, { value: "indoor", label: "실내" }, { value: "outdoor", label: "야외·테라스" }] as const;
const states = [{ value: null, label: "미정" }, { value: true, label: "사용" }, { value: false, label: "미사용" }] as const;

/** Edits the question's draft; its completion is the sole apply action. */
export function DogOutingControls({ value, onChange, onValidityChange }: {
  value?: DogOuting; onChange: (value?: DogOuting) => void; onValidityChange?: (valid: boolean) => void;
}) {
  const id = useId();
  const [weights, setWeights] = useState(() => value?.weightsKg.join(", ") ?? "");
  const [selection, setSelection] = useState<DogOuting>(() => ({ weightsKg: value?.weightsKg ?? [], leash: value?.leash ?? null, carrier: value?.carrier ?? null, muzzle: value?.muzzle ?? null, space: value?.space ?? "any" }));
  const [error, setError] = useState("");
  const publish = (next: DogOuting, text = weights) => {
    const parsed = parseDogOuting({ ...next, weightsKg: text.trim() ? text.split(",").map(item => Number(item.trim())) : [] });
    onValidityChange?.(Boolean(parsed));
    setError(parsed ? "" : "몸무게는 0보다 큰 숫자로 입력해주세요. 여러 마리는 쉼표로 구분해요.");
    if (parsed) onChange(parsed);
  };
  const choose = (next: DogOuting) => { setSelection(next); publish(next); };
  return <Fields data-dog-controls>
    <Group><legend>이용할 공간</legend><Choices>
      {spaces.map(option => <Choice key={option.value} type="button" $active={selection.space === option.value} aria-pressed={selection.space === option.value} onClick={() => choose({ ...selection, space: option.value })}>{option.label}</Choice>)}
    </Choices><Hint>실내·야외를 고르면 해당 구역의 동반 안내가 확인되는 곳만 찾아요.</Hint></Group>
    <Group><legend>함께 가는 반려견</legend>
      <WeightLabel htmlFor={`${id}-weights`}>몸무게 <span>kg</span></WeightLabel>
      <WeightInput id={`${id}-weights`} inputMode="decimal" value={weights} placeholder="예: 5 또는 5, 12" aria-invalid={Boolean(error)} aria-describedby={`${id}-weight-hint${error ? ` ${id}-error` : ""}`} onChange={event => {
        const text = event.target.value; setWeights(text); publish(selection, text);
      }} />
      <Hint id={`${id}-weight-hint`}>여러 마리는 각각 입력해주세요. 비워두면 몸무게 제한은 방문 전에 확인해요.</Hint>
      {error && <ErrorCopy role="alert" id={`${id}-error`}>{error}</ErrorCopy>}
    </Group>
    <Group><legend>사용할 준비물</legend>
      <PreparationRows>{preparations.map(item => <Preparation key={item.key}>
        <span id={`${id}-${item.key}`}>{item.label}</span><Choices role="group" aria-labelledby={`${id}-${item.key}`}>
          {states.map(option => <Choice key={String(option.value)} type="button" $active={(selection[item.key] ?? null) === option.value} aria-pressed={(selection[item.key] ?? null) === option.value} onClick={() => choose({ ...selection, [item.key]: option.value })}>{option.label}</Choice>)}
        </Choices>
      </Preparation>)}</PreparationRows>
    </Group>
    {(value || weights || error) && <Reset type="button" onClick={() => {
      const empty: DogOuting = { weightsKg: [], leash: null, carrier: null, muzzle: null, space: "any" };
      setWeights(""); setSelection(empty); setError(""); onValidityChange?.(true); onChange(undefined);
    }}>반려견 조건 초기화</Reset>}
  </Fields>;
}
const Fields = styled.div`display: grid; min-width: 0; gap: 24px;`;
const Group = styled.fieldset`margin: 0; padding: 0; border: 0; min-width: 0; legend { padding: 0; margin-bottom: 10px; font-size: 14px; font-weight: 600; line-height: 1.6; }`;
const Choices = styled.div`display: flex; gap: 6px; min-width: 0;`;
const Choice = styled(BaseButton)<{ $active: boolean }>`flex: 1; min-width: 0; min-height: 44px; padding: 8px 6px; border-radius: 10px; border: 1px solid ${({ $active }) => $active ? "var(--color-brand-700)" : "var(--color-border)"}; background: ${({ $active }) => $active ? "var(--color-brand-100)" : "var(--color-surface)"}; color: ${({ $active }) => $active ? "var(--color-brand-1000)" : "var(--color-text-muted)"}; font-size: 13px; font-weight: 500; line-height: 1.5; word-break: keep-all; transition: background 150ms ease, border-color 150ms ease; &:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; } @media (prefers-reduced-motion: reduce) { transition: none; }`;
const WeightLabel = styled.label`display: flex; gap: 8px; align-items: baseline; margin-bottom: 8px; font-size: 14px; span { color: var(--color-text-muted); font-size: 13px; }`;
const WeightInput = styled.input`${inputControlStyles} &[aria-invalid="true"] { border-color: var(--color-error); }`;
const Hint = styled.p`margin: 8px 0 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere;`;
const ErrorCopy = styled.p`margin: 8px 0 0; color: var(--color-error); font-size: 13px; line-height: 1.7;`;
const PreparationRows = styled.div`display: grid; gap: 10px;`;
const Preparation = styled.div`display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; align-items: center; > span { font-size: 14px; } @container app-viewport (max-width: 340px) { grid-template-columns: 1fr; gap: 6px; }`;
const Reset = styled(TextButton)`justify-self: start; min-height: 44px; padding: 8px 0; font-size: 13px; color: var(--color-text-muted);`;
