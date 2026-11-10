"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAllHarumadis } from "@/lib/harumadis";

/** 홈과 공통 내비게이션은 같은 계정의 목록·마디 수와 진행 중 요청을 공유한다. */
export function useHarumadiLibrary(ownerId?: string) {
  const query = useQuery({
    // Separate from the former partial/infinite cache. Prefix invalidations still apply.
    queryKey: ["library-harumadis", ownerId, "all"],
    queryFn: ({ signal }) => fetchAllHarumadis(ownerId!, signal),
    enabled: Boolean(ownerId), staleTime: 30_000, retry: false,
    gcTime: 5 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: true,
  });
  return { ...query, isFirstMadi: Boolean(ownerId && query.isSuccess && query.data?.pages[0]?.recordCount === 0) };
}
