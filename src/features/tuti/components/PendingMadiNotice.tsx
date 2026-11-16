"use client";

import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTutiStore } from "@/store/tuti";
import { pendingMadiPath } from "@/shared/tuti/pendingMadi";
import { BaseButton } from "./buttons";

export function PendingMadiNotice({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const pending = useTutiStore(state => state.pendingDeparture);
  const postpone = useTutiStore(state => state.postponePendingDeparture);
  const complete = useTutiStore(state => state.completePendingDeparture);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); };
  }, []);
  const path = pendingMadiPath(pending, ownerId, now);
  if (!path || !pending) return null;
  return <Notice aria-label="외출 후 마디 남기기">
    <p>{pending.placeName}에서 남기고 싶은 순간이 있나요?</p>
    <div><Action type="button" onClick={() => { router.push(path); complete(); }}>마디 남기기</Action>
      <Action type="button" onClick={postpone}>나중에</Action></div>
  </Notice>;
}
const Notice = styled.aside`flex: none; margin: 8px var(--screen-padding-right) 4px var(--screen-padding-left); padding: 12px 16px; background: var(--color-brand-100); border-radius: 12px; p { margin: 0; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; } > div { display: flex; gap: 16px; }`;
const Action = styled(BaseButton)`min-height: 44px; background: transparent; padding: 8px 0; font-size: 14px; color: var(--color-brand-1000); &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 2px; }`;
