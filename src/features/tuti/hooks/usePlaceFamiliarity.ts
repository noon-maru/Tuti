"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { getSessionSnapshot } from "@/lib/auth/session";
import { readPlaceFamiliarity, savePlaceFamiliarity } from "@/lib/placeFamiliarity";
import { showErrorToast, showToast } from "@/lib/feedback";

export function usePlaceFamiliarity(owner: string | undefined, placeId: string | undefined, enabled: boolean) {
  const client = useQueryClient();
  const key = ["place-familiarity", owner, placeId];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => readPlaceFamiliarity(owner!, placeId!, signal),
    enabled: enabled && Boolean(owner && placeId), staleTime: 30_000, retry: false });
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  async function toggle() {
    if (lock.current || !query.isSuccess || !owner || !placeId) return;
    lock.current = true; setPending(true);
    const familiar = !query.data.familiar;
    try {
      const result = await savePlaceFamiliarity(owner, placeId, familiar);
      if (getSessionSnapshot()?.userId !== owner) return;
      client.setQueryData(key, result);
      showToast(familiar ? "기억했어요. 다음 추천에서 새로운 곳을 먼저 찾아볼게요." : "익숙한 장소 표시를 취소했어요.");
      // 지금 보고 있는 카드와 순서를 유지한다. 다음 추천 요청부터 가점을 반영한다.
    } catch {
      if (getSessionSnapshot()?.userId === owner) showErrorToast("장소 표시를 저장하지 못했어요. 다시 시도해주세요.");
    } finally { lock.current = false; setPending(false); }
  }
  return { familiar: query.data?.familiar ?? false, ready: query.isSuccess, failed: query.isError, pending, toggle, retry: () => { void query.refetch(); } };
}
