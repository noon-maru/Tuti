"use client";
import { useState } from "react";
import styled from "@emotion/styled";
import { parseDogOuting, type DogOuting } from "@/shared/pets/dogAccess";
import { PrimaryButton, TextButton } from "./buttons";
import { inputControlStyles } from "@/shared/ui/typography";
export function DogOutingControls({ value, onChange }: { value?: DogOuting; onChange: (value?: DogOuting) => void }) {
  const [weights, setWeights] = useState("");
  const [leash, setLeash] = useState<boolean | null>(null);
  const [carrier, setCarrier] = useState<boolean | null>(null);
  const [space, setSpace] = useState<DogOuting["space"]>("any");
  const [muzzle, setMuzzle] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  return <Panel><details><summary>{value ? "동반 조건 변경" : "외출 조건 선택"}</summary><div>
    <p>세부 동반 조건을 골라보세요. 프로필 등록은 필요하지 않아요.</p>
    <label>어떤 공간을 찾고 있나요? · 선택<select value={space} onChange={event => setSpace(event.target.value as DogOuting["space"])}>
      <option value="any">상관없어요</option><option value="indoor">실내</option><option value="outdoor">야외 · 테라스</option>
    </select></label>
    <p>실내·야외를 선택하면 해당 구역의 동반 가능 여부가 확인되는 곳만 보여드려요.</p>
    <label>함께 가는 모든 반려견의 몸무게 · 선택 (kg)<input inputMode="decimal" placeholder="여러 마리는 5, 12처럼 입력" value={weights} onChange={e => setWeights(e.target.value)} /></label>
    <p>확인된 몸무게 제한을 넘는 곳은 제외해요. 미입력·미기재 조건은 방문 전에 확인해주세요.</p>
    {([{ label: "목줄", value: leash, set: setLeash }, { label: "이동장", value: carrier, set: setCarrier }, { label: "입마개", value: muzzle, set: setMuzzle }] as const).map(item => <label key={item.label}>{item.label}<select value={item.value === null ? "unknown" : String(item.value)} onChange={event => item.set(event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">아직 정하지 않았어요</option><option value="true">사용해요</option><option value="false">사용하지 않아요</option></select></label>)}
    <PrimaryButton type="button" onClick={() => {
      const parsed = parseDogOuting({ weightsKg: weights.trim() ? weights.split(",").map(item => Number(item.trim())) : [], leash, carrier, space, muzzle });
      if (!parsed) { setError("몸무게를 숫자로 확인해주세요. 여러 마리는 쉼표로 구분해요."); return; }
      setError(""); onChange(parsed);
    }}>이 조건으로 찾기</PrimaryButton>
    {value && <TextButton type="button" onClick={() => { setWeights(""); setSpace("any"); setLeash(null); setCarrier(null); setMuzzle(null); onChange(undefined); }}>세부 동반 조건 지우기</TextButton>}
    {error && <p role="alert">{error}</p>}
  </div></details>{value && <p role="status">공식 등록 정보와 확인된 조건으로 찾아요. 미확인 조건은 방문 전에 확인해주세요.</p>}</Panel>;
}
const Panel = styled.div`flex: none; padding: 8px 20px; font-size: 13px; line-height: 1.6; background: var(--color-surface); summary { min-height: 44px; cursor: pointer; padding: 10px 0; color: var(--color-brand-1000); } details > div { display: grid; gap: 12px; max-height: 280px; overflow-y: auto; padding: 4px 3px 12px; } p { margin: 0; color: var(--color-text-muted); } label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 44px; } input:not([type="checkbox"]), select { ${inputControlStyles} width: 100%; min-width: 0; } input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--color-brand-700); }`;
