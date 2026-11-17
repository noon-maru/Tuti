"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { useSession } from "../hooks/useSession";
import { notificationRequest } from "@/lib/notificationSettings";
import { parsePetProfile, type PetProfile } from "@/shared/pets/profile";
import { petProfilesKey, usePetProfiles } from "../hooks/usePetProfiles";
import { confirmAction } from "@/lib/feedback";
import { PrimaryButton, TextButton } from "./buttons";
import { inputControlStyles } from "@/shared/ui/typography";

type PetProfilesProps = {
  selected?: string[]; onChange?: (ids: string[]) => void; disabled?: boolean;
  registrationOnly?: boolean; onRegistered?: () => void; onBusyChange?: (busy: boolean) => void;
};
export function PetProfiles(props: PetProfilesProps) {
  const owner = useSession()?.userId;
  return owner ? <PetProfilesEditor key={owner} owner={owner} {...props} /> : null;
}
function PetProfilesEditor({ owner, selected, onChange, disabled = false, registrationOnly = false, onRegistered, onBusyChange }: PetProfilesProps & { owner: string }) {
  const client = useQueryClient();
  const query = usePetProfiles(owner);
  const inFlight = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("dog");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PetProfile | null>(null);
  useEffect(() => {
    if (registrationOnly && query.data?.pets.length && !busy && !error) onRegistered?.();
  }, [registrationOnly, query.data, busy, error, onRegistered]);
  const setWorking = (value: boolean) => { setBusy(value); onBusyChange?.(value); };
  const reset = () => { setName(""); setWeight(""); setSpecies("dog"); setEditing(null); setAdding(false); };
  const refresh = () => {
    // A failed background read must not turn an already committed write into a save failure.
    void client.invalidateQueries({ queryKey: petProfilesKey(owner) }).catch(() => {});
    void client.invalidateQueries({ queryKey: ["journal-entries", owner] }).catch(() => {});
  };
  const reload = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setWorking(true);
    try {
      const latest = await query.refetch();
      if (latest.isError || !latest.data) return;
      const pet = latest.data.pets.find(item => item.id === editing?.id);
      if (editing && pet) {
        setEditing(pet); setName(pet.name); setSpecies(pet.species);
        setWeight(pet.weightKg === null ? "" : String(pet.weightKg)); setError("");
      } else if (editing) {
        setEditing(null); setError("");
        setNotice("이 프로필은 삭제되었어요. 입력한 내용은 남겨뒀어요. 원하면 새 프로필로 등록할 수 있어요.");
      }
    } catch { setError("최신 프로필을 확인하지 못했어요. 입력한 내용은 그대로예요."); }
    finally { inFlight.current = false; setWorking(false); }
  };
  const create = async () => {
    if (inFlight.current || disabled || !owner) return;
    const input = parsePetProfile({ name, species, weightKg: weight.trim() ? Number(weight) : null });
    if (!input) { setError("이름과 몸무게를 확인해주세요. 몸무게는 비워두거나 0보다 크고 150kg 이하로 입력해요."); return; }
    inFlight.current = true;
    setWorking(true); setError(""); setNotice("");
    let registered = false;
    try {
      const result = await notificationRequest<{ pet: PetProfile }>(editing ? `pets/${encodeURIComponent(editing.id)}` : "pets", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, ...(editing ? { revision: editing.revision } : {}) }) }, owner);
      client.setQueryData<{ pets: PetProfile[] }>(petProfilesKey(owner), previous => ({ pets: [...(previous?.pets ?? []).filter(pet => pet.id !== result.pet.id), result.pet] }));
      setNotice(editing ? "프로필을 수정했어요." : "프로필을 등록했어요. 함께한 반려동물을 선택해 연결할 수 있어요.");
      reset(); refresh();
      registered = true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "프로필을 저장하지 못했어요. 입력한 내용은 그대로예요."); }
    finally { inFlight.current = false; setWorking(false); }
    if (registered) onRegistered?.();
  };
  const remove = async (pet: PetProfile) => {
    if (inFlight.current || disabled || !owner) return;
    inFlight.current = true; setWorking(true); setError(""); setNotice("");
    try {
      if (!await confirmAction("프로필과 마디의 연결만 삭제해요. 원본 마디·하루마디·저장한 PDF는 그대로 남아요.", { title: `${pet.name} 프로필을 삭제할까요?`, confirmLabel: "프로필 삭제", tone: "danger" })) return;
      await notificationRequest(`pets/${encodeURIComponent(pet.id)}`, { method: "DELETE" }, owner);
      client.setQueryData<{ pets: PetProfile[] }>(petProfilesKey(owner), previous => ({ pets: (previous?.pets ?? []).filter(item => item.id !== pet.id) }));
      if (editing?.id === pet.id) reset();
      setNotice("프로필을 삭제했어요. 남긴 마디는 그대로예요."); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "프로필을 삭제하지 못했어요."); }
    finally { inFlight.current = false; setWorking(false); }
  };
  return <Panel aria-busy={busy}>
    {registrationOnly && query.isPending && <p role="status">등록한 프로필을 확인하고 있어요.</p>}
    {registrationOnly && query.isError && <p role="status">프로필을 확인하지 못했어요. 직접 등록하거나 건너뛸 수 있어요.<TextButton type="button" disabled={busy} onClick={() => void query.refetch()}>다시 확인</TextButton></p>}
    {!registrationOnly && (query.isPending ? <p role="status">프로필을 불러오고 있어요.</p> : query.isError && !query.data ? <p role="alert">프로필을 불러오지 못했어요. 기록은 연결 없이 남길 수 있어요.<TextButton type="button" onClick={() => void query.refetch()}>다시 확인</TextButton></p> : <>
      {query.isError && <p role="status">저장된 프로필을 보여드리고 있어요.<TextButton type="button" disabled={busy || disabled} onClick={() => void query.refetch()}>목록 다시 확인</TextButton></p>}
      {!query.data?.pets.length && <p>등록한 반려동물이 없어요. 프로필 없이도 마디를 남길 수 있어요.</p>}
      {onChange && !query.isError && selected?.some(id => !query.data?.pets.some(pet => pet.id === id)) && <p role="status">일부 프로필을 찾지 못했어요.<TextButton type="button" disabled={disabled || busy} onClick={() => onChange(selected.filter(id => query.data?.pets.some(pet => pet.id === id)))}>없어진 프로필 연결 해제</TextButton></p>}
      {onChange && (selected?.length ?? 0) >= 20 && <p role="status">한 마디에는 최대 20개의 프로필을 연결할 수 있어요.</p>}
      {query.data?.pets.map(pet => <Row key={pet.id}>{onChange ? <label><input type="checkbox" disabled={disabled || busy || (!selected?.includes(pet.id) && (selected?.length ?? 0) >= 20)} checked={selected?.includes(pet.id) ?? false} onChange={e => onChange(e.target.checked ? [...(selected ?? []), pet.id] : (selected ?? []).filter(id => id !== pet.id))} /><span>{pet.name}<small>{pet.species === "dog" ? "반려견" : "반려묘"}{pet.weightKg !== null ? ` · ${pet.weightKg}kg` : ""}</small></span></label> : <><span>{pet.name}<small>{pet.species === "dog" ? "반려견" : "반려묘"}{pet.weightKg !== null ? ` · ${pet.weightKg}kg` : " · 몸무게 미입력"}</small></span><TextButton type="button" disabled={busy} onClick={() => { setEditing(pet); setName(pet.name); setSpecies(pet.species); setWeight(pet.weightKg === null ? "" : String(pet.weightKg)); setError(""); setNotice(""); nameInput.current?.focus(); }}>수정</TextButton><TextButton type="button" disabled={busy} onClick={() => void remove(pet)}>삭제</TextButton></>}</Row>)}
    </>)}
    {onChange && !adding && <TextButton type="button" disabled={disabled || busy} onClick={() => { setAdding(true); setError(""); }}>새 반려동물 등록</TextButton>}
    {(!onChange || adding) && <form hidden={registrationOnly && query.isPending} onSubmit={event => { event.preventDefault(); void create(); }}>
      {!registrationOnly && <h2>{editing ? `${editing.name} 프로필 수정` : "새 반려동물"}</h2>}
      <label>이름<input ref={nameInput} value={name} onChange={e => setName(e.target.value)} maxLength={60} required disabled={busy || disabled} autoComplete="off" /></label>
      <label>종류<select value={species} onChange={e => setSpecies(e.target.value)} disabled={busy || disabled}><option value="dog">반려견</option><option value="cat">반려묘</option></select></label>
      <label>몸무게 · 선택 (kg)<input type="number" min="0" max="150" step="any" value={weight} onChange={e => setWeight(e.target.value)} disabled={busy || disabled} /></label>
      <small>{registrationOnly ? "다른 반려동물도 설정에서 더 추가할 수 있어요." : "등록만으로 마디에 연결되거나 나들이 조건이 바뀌지는 않아요."}</small>
      <PrimaryButton type="submit" disabled={busy || disabled || !name.trim()}>{busy ? "처리하고 있어요…" : editing ? "변경사항 저장" : registrationOnly ? "등록하고 시작하기" : "프로필 등록"}</PrimaryButton>
      {(editing || adding) && <TextButton type="button" disabled={busy} onClick={() => { reset(); setError(""); }}>{editing ? "수정 취소" : "등록 취소"}</TextButton>}
    </form>}
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert"><p>{error}</p><TextButton type="button" disabled={busy || disabled} onClick={() => void reload()}>{editing ? "최신 내용으로 다시 채우기" : "목록 다시 확인"}</TextButton></div>}
  </Panel>;
}
const Panel = styled.div`display: grid; min-width: 0; gap: 16px; p { margin: 0; font-size: 14px; line-height: 1.7; } h2 { font-size: 16px; margin: 8px 0 0; overflow-wrap: anywhere; } form { display: grid; gap: 16px; } form[hidden] { display: none; } form label { display: grid; gap: 8px; font-size: 14px; } form input, select { ${inputControlStyles} width: 100%; min-width: 0; } small { font-size: 13px; line-height: 1.7; color: var(--color-text-muted); }`;
const Row = styled.div`display: flex; align-items: center; gap: 8px; min-height: 64px; border-bottom: 1px solid var(--color-border); > span, label { flex: 1; min-width: 0; overflow-wrap: anywhere; } label { display: flex; align-items: center; gap: 10px; min-height: 48px; } small { display: block; } button { flex: none; min-height: 44px; } input { flex: none; width: 20px; height: 20px; accent-color: var(--color-brand-700); }`;
