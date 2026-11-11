"use client";
import styled from "@emotion/styled";
import { BaseButton, TextButton } from "./buttons";
import { inputControlStyles, nativeDateInputStyles, captionStyles } from "@/shared/ui/typography";
import { HARUMADI_TITLE_IDEAS, harumadiPeriodLabel, parseHarumadiPeriod, type HarumadiPeriod } from "@/shared/harumadi/period";

export function HarumadiTitleIdeas({ onChoose, disabled }: { onChoose: (title: string) => void; disabled?: boolean }) {
  return <Ideas aria-label="하루마디 이름 예시"><summary>이름이 고민된다면</summary><div>{HARUMADI_TITLE_IDEAS.map(title => <Idea key={title} type="button" disabled={disabled} onClick={() => onChoose(title)}>{title}</Idea>)}</div></Ideas>;
}
export function HarumadiPeriodFields({ value, onChange, disabled }: { value: HarumadiPeriod; onChange: (period: HarumadiPeriod) => void; disabled?: boolean }) {
  const start = value.periodStart ?? "", end = value.periodEnd ?? "";
  const valid = parseHarumadiPeriod({ periodStart: start || null, periodEnd: end || null });
  return <Period open={Boolean(start || end)}><summary>담고 싶은 기간 <small>선택</small>{harumadiPeriodLabel(value) && <span>{harumadiPeriodLabel(value)}</span>}</summary>
    <p id="harumadi-period-hint">이 책에 담고 싶은 순간의 범위예요. 기간이 지나도 계속 채울 수 있어요.</p>
    <Dates><label>첫날<input type="date" aria-label="담고 싶은 기간 첫날" aria-describedby="harumadi-period-hint" disabled={disabled} value={start} max={end || undefined} onChange={e => onChange({ periodStart: e.target.value || null, periodEnd: end || null })} /></label>
    <label>마지막 날<input type="date" aria-label="담고 싶은 기간 마지막 날" aria-describedby="harumadi-period-hint" disabled={disabled} value={end} min={start || undefined} onChange={e => onChange({ periodStart: start || null, periodEnd: e.target.value || null })} /></label></Dates>
    {!valid && <p role="status">시작일과 마지막 날을 올바른 순서로 모두 골라주세요.</p>}
    {(start || end) && <TextButton type="button" disabled={disabled} onClick={() => onChange({ periodStart: null, periodEnd: null })}>기간 없이 채우기</TextButton>}
  </Period>;
}
const Ideas = styled.details`summary { ${captionStyles} min-height: 44px; padding: 10px 0; cursor: pointer; } > div { display: flex; flex-wrap: wrap; gap: 4px 12px; }`;
const Idea = styled(BaseButton)`min-height: 44px; padding: 8px 0; background: transparent; color: var(--color-brand-1000); font-size: 13px; text-align: left; &:disabled { opacity: .5; } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 2px; }`;
const Period = styled.details`min-width: 0; summary { cursor: pointer; min-height: 44px; padding: 10px 0; font-size: 14px; line-height: 1.7; } small { ${captionStyles} margin-left: 8px; } summary span { display: block; color: var(--color-text-muted); font-size: 12px; } p { ${captionStyles} margin: 8px 0 12px; }`;
const Dates = styled.div`display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; label { display: grid; min-width: 0; gap: 8px; font-size: 13px; } input { ${inputControlStyles} ${nativeDateInputStyles} width: 100%; min-width: 0; font-size: 14px; padding: 10px 8px; } @container app-viewport (max-width: 340px) { grid-template-columns: minmax(0, 1fr); }`;
