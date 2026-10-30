"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { madiDraftStorage, type MadiDraft } from "@/lib/madiDraft";
import { trackLifecycle } from "@/lib/lifecycle";

export function useMadiDraft({ ownerId, scope, source, value, restore, enabled = true, privateOnly = false }: {
  ownerId?: string; scope: string; source: string; value: MadiDraft;
  restore: (value: MadiDraft) => void; enabled?: boolean; privateOnly?: boolean;
}) {
  const [ready, setReady] = useState(!ownerId || !enabled);
  const [notice, setNotice] = useState("");
  const [baseline] = useState(() => JSON.stringify(value));
  const latest = useRef<(() => Promise<void>) | null>(null);
  const restoreRef = useRef(restore);
  const stopped = useRef(false);
  const epoch = useRef(0);
  const dirty = JSON.stringify(value) !== baseline;
  useEffect(() => { restoreRef.current = restore; }, [restore]);
  useEffect(() => {
    if (!ownerId || !enabled) return;
    let active = true;
    epoch.current = madiDraftStorage.ticket(ownerId);
    void (privateOnly ? madiDraftStorage.remove(ownerId, scope).then(() => null) : madiDraftStorage.load(ownerId, scope, source))
      .then(draft => {
        if (!active) return;
        if (draft) { restoreRef.current(draft); setNotice("이 기기에 남겨둔 초안을 이어서 작성해요."); if (scope === "new") trackLifecycle("draft_restored"); }
      }).catch(() => { if (active) setNotice("초안을 불러오지 못했어요. 이 화면을 나가기 전에 내용을 확인해주세요."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
    // 작성 중 값 변경이나 저장 완료가 초안 복원을 다시 실행하지 않도록 계정·작성 대상에만 묶는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, scope, source]);
  useEffect(() => { if (enabled) stopped.current = false; }, [enabled]);
  useEffect(() => {
    if (!ownerId || !ready || !enabled || stopped.current) { latest.current = null; return; }
    const expected = epoch.current;
    const write = async () => {
      if (stopped.current) return;
      if (privateOnly || !dirty) await madiDraftStorage.remove(ownerId, scope);
      else await madiDraftStorage.save(ownerId, scope, source, value, expected);
    };
    latest.current = write;
    const timer = window.setTimeout(() => { void write().catch(() => setNotice("초안을 임시 저장하지 못했어요. 화면을 나가면 내용이 사라질 수 있어요.")); }, 350);
    return () => window.clearTimeout(timer);
  }, [ownerId, scope, source, value, ready, enabled, dirty, privateOnly]);
  useEffect(() => {
    const flush = () => { void latest.current?.().catch(() => {}); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (dirty && enabled && !stopped.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, enabled]);
  useEffect(() => () => { void latest.current?.().catch(() => {}); }, []);

  const finish = useCallback(async () => {
    stopped.current = true; latest.current = null;
    if (ownerId) await madiDraftStorage.remove(ownerId, scope).catch(() => {});
  }, [ownerId, scope]);
  const leave = async (navigate: () => void) => {
    if (dirty && !stopped.current && !window.confirm(privateOnly ? "작성 중인 내용은 임시 저장되지 않아요. 나갈까요?" : "작성 중인 내용을 초안으로 남겨두고 나갈까요?")) return;
    try { await latest.current?.(); }
    catch { if (!window.confirm("초안을 저장하지 못했어요. 그래도 나갈까요?")) return; }
    if (scope === "new" && !stopped.current) trackLifecycle("compose_exited");
    navigate();
  };
  return { ready, notice: privateOnly && dirty ? "이 마디는 기기에 임시 저장하지 않아요. 나가기 전에 저장을 마쳐주세요." : notice, finish, leave };
}
