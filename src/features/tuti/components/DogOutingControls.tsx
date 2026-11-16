"use client";
import { useState } from "react";
import styled from "@emotion/styled";
import { parseDogOuting, type DogOuting } from "@/shared/pets/dogAccess";
import { PrimaryButton, TextButton } from "./buttons";
import { inputControlStyles } from "@/shared/ui/typography";
export function DogOutingControls({ value, onChange }: { value?: DogOuting; onChange: (value?: DogOuting) => void }) {
  const [weights, setWeights] = useState("");
  const [leash, setLeash] = useState(false);
  const [carrier, setCarrier] = useState(false);
  const [error, setError] = useState("");
  return <Panel><details><summary>{value ? "반려견 동반 · 조건 변경" : "반려견과 갈 곳 찾기"}</summary><div>
    <p>확인한 동반 조건이 맞는 장소만 찾아요. 확인된 곳이 부족하면 결과가 없을 수 있어요. 프로필 등록은 필요하지 않아요.</p>
    <label>함께 가는 모든 반려견의 몸무게 · 선택 (kg)<input inputMode="decimal" placeholder="여러 마리는 5, 12처럼 입력" value={weights} onChange={e => setWeights(e.target.value)} /></label>
    <p>몸무게를 입력하지 않으면 크기 제한이 있는 곳은 제외해요.</p>
    <label><input type="checkbox" checked={leash} onChange={e => setLeash(e.target.checked)} />목줄을 착용해요</label>
    <label><input type="checkbox" checked={carrier} onChange={e => setCarrier(e.target.checked)} />이동장을 사용해요</label>
    <PrimaryButton type="button" onClick={() => {
      const parsed = parseDogOuting({ weightsKg: weights.trim() ? weights.split(",").map(item => Number(item.trim())) : [], leash, carrier });
      if (!parsed) { setError("몸무게를 숫자로 확인해주세요. 여러 마리는 쉼표로 구분해요."); return; }
      setError(""); onChange(parsed);
    }}>이 조건으로 찾기</PrimaryButton>
    {value && <TextButton type="button" onClick={() => onChange(undefined)}>일반 장소로 보기</TextButton>}
    {error && <p role="alert">{error}</p>}
  </div></details>{value && <p role="status">동반 조건 확인된 곳만 표시해요. 방문 전 최신 운영 안내도 확인해주세요.</p>}</Panel>;
}
const Panel = styled.div`flex: none; padding: 8px 20px; font-size: 13px; line-height: 1.6; background: var(--color-surface); summary { min-height: 44px; cursor: pointer; padding: 10px 0; color: var(--color-brand-1000); } details > div { display: grid; gap: 12px; max-height: 240px; overflow-y: auto; padding: 4px 3px 12px; } p { margin: 0; color: var(--color-text-muted); } label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 44px; } input:not([type="checkbox"]) { ${inputControlStyles} width: 100%; min-width: 0; } input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--color-brand-700); }`;
