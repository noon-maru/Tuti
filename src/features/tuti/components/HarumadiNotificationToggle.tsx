"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { notificationRequest } from "@/lib/notificationSettings";
export function HarumadiNotificationToggle({ owner, bookId }: { owner: string; bookId: string }) {
  const client = useQueryClient();
  const key = ["harumadi-notification", owner, bookId];
  const path = `harumadis/${encodeURIComponent(bookId)}/notifications`;
  const query = useQuery({ queryKey: key, queryFn: () => notificationRequest<{ muted: boolean }>(path), retry: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div><label style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", minHeight: 48 }}>
    이 하루마디 알림 받기<input type="checkbox" role="switch" checked={query.data ? !query.data.muted : false} disabled={busy || !query.data}
      onChange={event => {
        const muted = !event.target.checked; setBusy(true); setError("");
        void notificationRequest<{ muted: boolean }>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ muted }) })
          .then(data => client.setQueryData(key, data)).catch(() => setError("알림 설정을 저장하지 못했어요."))
          .finally(() => setBusy(false));
      }} />
  </label>{(error || query.error) && <p role="status">{error || "알림 설정을 불러오지 못했어요."}</p>}</div>;
}
