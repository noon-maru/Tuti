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
  const [purpose, setPurpose] = useState<DogOuting["purpose"]>();
  return <Panel><details><summary>{value ? "동반 조건 변경" : "외출 조건 선택"}</summary><div>
    <p>공식 동반 등록 장소도 함께 찾아요. 세부 조건이 미확인인 곳은 별도로 표시해요. 프로필 등록은 필요하지 않아요.</p>
    <label>어떤 하루를 보내고 싶나요? · 선택<select value={purpose ?? ""} onChange={event => setPurpose((event.target.value || undefined) as DogOuting["purpose"])}>
      <option value="">정하지 않고 둘러보기</option><option value="walk">함께 걷기</option><option value="cafe">카페에서 쉬기</option><option value="outing">새로운 곳 나들이</option>
    </select></label>
    <label>함께 가는 모든 반려견의 몸무게 · 선택 (kg)<input inputMode="decimal" placeholder="여러 마리는 5, 12처럼 입력" value={weights} onChange={e => setWeights(e.target.value)} /></label>
    <p>확인된 몸무게 제한을 넘는 곳은 제외해요. 미입력·미기재 조건은 방문 전에 확인해주세요.</p>
    <label><input type="checkbox" checked={leash} onChange={e => setLeash(e.target.checked)} />목줄을 착용해요</label>
    <label><input type="checkbox" checked={carrier} onChange={e => setCarrier(e.target.checked)} />이동장을 사용해요</label>
    <PrimaryButton type="button" onClick={() => {
      const parsed = parseDogOuting({ weightsKg: weights.trim() ? weights.split(",").map(item => Number(item.trim())) : [], leash, carrier, ...(purpose ? { purpose } : {}) });
      if (!parsed) { setError("몸무게를 숫자로 확인해주세요. 여러 마리는 쉼표로 구분해요."); return; }
      setError(""); onChange(parsed);
    }}>이 조건으로 찾기</PrimaryButton>
    {value && <TextButton type="button" onClick={() => onChange(undefined)}>조건 없이 둘러보기</TextButton>}
    {error && <p role="alert">{error}</p>}
  </div></details>{value && <p role="status">공식 등록 정보와 확인된 조건으로 찾아요. 미확인 조건은 방문 전에 확인해주세요.</p>}</Panel>;
}
const Panel = styled.div`flex: none; padding: 8px 20px; font-size: 13px; line-height: 1.6; background: var(--color-surface); summary { min-height: 44px; cursor: pointer; padding: 10px 0; color: var(--color-brand-1000); } details > div { display: grid; gap: 12px; max-height: 280px; overflow-y: auto; padding: 4px 3px 12px; } p { margin: 0; color: var(--color-text-muted); } label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 44px; } input:not([type="checkbox"]), select { ${inputControlStyles} width: 100%; min-width: 0; } input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--color-brand-700); }`;
