"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { useSession } from "../hooks/useSession";
import { notificationRequest } from "@/lib/notificationSettings";
import type { PetProfile } from "@/shared/pets/profile";
import { confirmAction } from "@/lib/feedback";
import { PrimaryButton, TextButton } from "./buttons";
import { inputControlStyles } from "@/shared/ui/typography";

type PetProfilesProps = { selected?: string[]; onChange?: (ids: string[]) => void; disabled?: boolean };
export function PetProfiles(props: PetProfilesProps) {
  const owner = useSession()?.userId;
  return owner ? <PetProfilesEditor key={owner} owner={owner} {...props} /> : null;
}
function PetProfilesEditor({ owner, selected, onChange, disabled = false }: PetProfilesProps & { owner: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["pet-profiles", owner], queryFn: () => notificationRequest<{ pets: PetProfile[] }>("pets", undefined, owner), enabled: Boolean(owner), retry: false });
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("dog");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PetProfile | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["pet-profiles", owner] });
  const create = async () => {
    if (busy || !owner) return;
    setBusy(true); setError("");
    try {
      await notificationRequest(editing ? `pets/${encodeURIComponent(editing.id)}` : "pets", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, species, weightKg: weight ? Number(weight) : null, ...(editing ? { revision: editing.revision } : {}) }) }, owner);
      setName(""); setWeight(""); setEditing(null); await refresh();
      await client.invalidateQueries({ queryKey: ["journal-entries", owner] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "프로필을 등록하지 못했어요."); }
    finally { setBusy(false); }
  };
  const remove = async (pet: PetProfile) => {
    if (busy || !owner || !await confirmAction("프로필과 마디의 연결만 삭제해요. 원본 마디·하루마디·저장한 PDF는 그대로 남아요.", { title: `${pet.name} 프로필을 삭제할까요?`, confirmLabel: "프로필 삭제", tone: "danger" })) return;
    setBusy(true); setError("");
    try {
      await notificationRequest(`pets/${encodeURIComponent(pet.id)}`, { method: "DELETE" }, owner);
      await refresh();
      await client.invalidateQueries({ queryKey: ["journal-entries", owner] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "프로필을 삭제하지 못했어요."); }
    finally { setBusy(false); }
  };
  return <Panel aria-busy={busy}>
    {query.isPending ? <p role="status">프로필을 불러오고 있어요.</p> : query.isError ? <p role="alert">프로필을 불러오지 못했어요. 기록은 연결 없이 남길 수 있어요.<TextButton type="button" onClick={() => void query.refetch()}>다시 확인</TextButton></p> : <>
      {!query.data?.pets.length && <p>등록한 반려동물이 없어요. 프로필 없이도 마디를 남길 수 있어요.</p>}
      {onChange && selected?.some(id => !query.data?.pets.some(pet => pet.id === id)) && <p role="status">일부 프로필을 찾지 못했어요.<TextButton type="button" disabled={disabled} onClick={() => onChange(selected.filter(id => query.data?.pets.some(pet => pet.id === id)))}>없어진 프로필 연결 해제</TextButton></p>}
      {query.data?.pets.map(pet => <Row key={pet.id}>{onChange ? <label><input type="checkbox" disabled={disabled} checked={selected?.includes(pet.id) ?? false} onChange={e => onChange(e.target.checked ? [...(selected ?? []), pet.id] : (selected ?? []).filter(id => id !== pet.id))} />{pet.name}<small>{pet.species === "dog" ? "반려견" : "반려묘"}</small></label> : <><span>{pet.name} · {pet.species === "dog" ? "반려견" : "반려묘"}</span><TextButton type="button" disabled={busy} onClick={() => { setEditing(pet); setName(pet.name); setSpecies(pet.species); setWeight(pet.weightKg === null ? "" : String(pet.weightKg)); }}>수정</TextButton><TextButton type="button" disabled={busy} onClick={() => void remove(pet)}>삭제</TextButton></>}</Row>)}
    </>}
    {!onChange && <form onSubmit={event => { event.preventDefault(); void create(); }}>
      <label>이름<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required disabled={busy} /></label>
      <label>종류<select value={species} onChange={e => setSpecies(e.target.value)} disabled={busy}><option value="dog">반려견</option><option value="cat">반려묘</option></select></label>
      <label>몸무게 · 선택 (kg)<input type="number" min="0.1" max="150" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} disabled={busy} /></label>
      <PrimaryButton type="submit" disabled={busy || !name.trim()}>{busy ? "처리하고 있어요…" : editing ? "변경사항 저장" : "프로필 등록"}</PrimaryButton>
      {editing && <TextButton type="button" disabled={busy} onClick={() => { setEditing(null); setName(""); setWeight(""); }}>수정 취소</TextButton>}
    </form>}
    {error && <p role="alert">{error}</p>}
  </Panel>;
}
const Panel = styled.div`display: grid; gap: 16px; p { margin: 0; font-size: 14px; line-height: 1.7; } form { display: grid; gap: 16px; } form label { display: grid; gap: 8px; font-size: 14px; } form input, select { ${inputControlStyles} width: 100%; min-width: 0; }`;
const Row = styled.div`display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; border-bottom: 1px solid var(--color-border); label { display: flex; align-items: center; gap: 10px; min-height: 48px; } small { color: var(--color-text-muted); } input { width: 20px; height: 20px; accent-color: var(--color-brand-700); }`;
