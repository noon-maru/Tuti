"use client";
import { useState } from "react";
import styled from "@emotion/styled";
import { useSession } from "../hooks/useSession";
import { usePetProfiles } from "../hooks/usePetProfiles";
import { selectedDogWeights } from "@/shared/pets/outingProfiles";
import { TextButton } from "./buttons";

export function DogProfileWeights({ onApply }: { onApply: (weights: number[]) => void }) {
  const owner = useSession()?.userId;
  return owner ? <Picker key={owner} owner={owner} onApply={onApply} /> : null;
}
function Picker({ owner, onApply }: { owner: string; onApply: (weights: number[]) => void }) {
  const query = usePetProfiles(owner);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const dogs = query.data?.pets.filter(pet => pet.species === "dog") ?? [];
  const weights = selectedDogWeights(dogs, selected);
  if (query.isPending) return <Options><p role="status">등록한 반려견을 확인하고 있어요. 몸무게를 직접 입력해도 괜찮아요.</p></Options>;
  if (query.isError) return <Options><p>프로필을 불러오지 못했어요. 아래에서 직접 입력할 수 있어요.</p><TextButton type="button" onClick={() => void query.refetch()}>프로필 다시 확인</TextButton></Options>;
  if (!dogs.length) return null;
  return <Options>
    <p>등록한 반려견에서 몸무게 불러오기 · 선택</p>
    <Dogs>{dogs.map(pet => <label key={pet.id}>
      <input type="checkbox" checked={selected.includes(pet.id)} disabled={!selected.includes(pet.id) && selected.length >= 20} onChange={event => { setSelected(event.target.checked ? [...selected, pet.id] : selected.filter(id => id !== pet.id)); setNotice(""); }} />
      <span>{pet.name}<small>{pet.weightKg === null ? "몸무게 미입력" : `${pet.weightKg}kg`}</small></span>
    </label>)}</Dogs>
    {selected.length > 0 && <>
      {!weights && <p role="status">선택한 반려견의 몸무게를 모두 확인하지 못했어요. 아래에 함께 가는 반려견의 몸무게를 직접 입력해주세요.</p>}
      <TextButton type="button" disabled={!weights} onClick={() => { if (weights) { onApply(weights); setSelected([]); setNotice("몸무게를 불러왔어요. 이번 외출에 맞게 아래에서 바꿀 수 있어요."); } }}>선택한 몸무게 불러오기</TextButton>
    </>}
    {notice && <p role="status">{notice}</p>}
  </Options>;
}
const Options = styled.div`margin-bottom: 16px; min-width: 0; p { margin: 0 0 8px; font-size: 13px; line-height: 1.7; color: var(--color-text-muted); }`;
const Dogs = styled.div`display: flex; flex-wrap: wrap; gap: 8px 16px; label { display: flex; align-items: center; gap: 8px; min-height: 44px; max-width: 100%; font-size: 14px; overflow-wrap: anywhere; } input { flex: none; width: 20px; height: 20px; accent-color: var(--color-brand-700); } small { margin-left: 6px; color: var(--color-text-muted); font-size: 13px; }`;
