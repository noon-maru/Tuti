"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import styled from "@emotion/styled";
import { TextButton } from "./buttons";
import { notificationRequest } from "@/lib/notificationSettings";
export function HarumadiNotificationToggle({ owner, bookId, disabled = false }: { owner: string; bookId: string; disabled?: boolean }) {
  const client = useQueryClient();
  const key = ["harumadi-notification", owner, bookId];
  const path = `harumadis/${encodeURIComponent(bookId)}/notifications`;
  const query = useQuery({ queryKey: key, queryFn: () => notificationRequest<{ muted: boolean }>(path, undefined, owner), retry: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const descriptionId = useId();
  return <Setting aria-busy={busy || query.isPending}><Label>
    <Copy><strong>이 하루마디 알림 받기</strong><span id={descriptionId}>{query.isPending ? "알림 설정을 확인하고 있어요." : "앱 알림 설정도 함께 적용돼요."}</span></Copy>
    <Control><input type="checkbox" role="switch" aria-label="이 하루마디 알림 받기" aria-describedby={descriptionId} checked={query.data ? !query.data.muted : false} disabled={disabled || busy || !query.data}
      onChange={event => {
        const muted = !event.target.checked; setBusy(true); setError("");
        void notificationRequest<{ muted: boolean }>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ muted }) }, owner)
          .then(data => client.setQueryData(key, data)).catch(() => setError("알림 설정을 저장하지 못했어요."))
          .finally(() => setBusy(false));
      }} /><Track aria-hidden="true" /></Control>
  </Label>{(error || query.error) && <ErrorMessage role="alert">{error || "알림 설정을 불러오지 못했어요."}{query.isError && <TextButton type="button" disabled={disabled || busy || query.isFetching} onClick={() => void query.refetch()}>다시 확인하기</TextButton>}</ErrorMessage>}</Setting>;
}

const Setting = styled.div`padding: 14px 0; min-width: 0;`;
const Label = styled.label`display: flex; gap: 16px; align-items: center; justify-content: space-between; min-height: 44px; cursor: pointer;`;
const Copy = styled.span`display: grid; gap: 4px; min-width: 0; strong { font-size: 14px; font-weight: 500; line-height: 1.6; } > span { font-size: 12px; line-height: 1.7; color: var(--color-text-muted); overflow-wrap: anywhere; }`;
const Control = styled.span`position: relative; display: inline-grid; place-items: center; width: 46px; height: 44px; flex: none;
  input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  &:has(input:focus-visible) { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; border-radius: 8px; }
  &:has(input:disabled) { opacity: .5; cursor: default; }
  input:checked + span { background: var(--color-brand-800); }
  input:checked + span::after { transform: translateX(18px); }
`;
const Track = styled.span`position: relative; width: 46px; height: 28px; border-radius: 999px; background: var(--color-neutral-700); transition: background-color 180ms ease;
  &::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--color-white); transition: transform 180ms ease; }
  @media (prefers-reduced-motion: reduce) { transition: none; &::after { transition: none; } }
`;
const ErrorMessage = styled.p`margin: 8px 0 0; color: var(--color-error); font-size: 13px; line-height: 1.7; button { min-height: 44px; margin-left: 8px; padding: 8px; }`;
