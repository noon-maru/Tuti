"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllHarumadis } from "@/lib/harumadis";
import { displayFirstMadiShelf, readFirstMadiShelf } from "@/lib/firstMadiShelfPreview";

/** 홈과 공통 내비게이션은 같은 계정의 목록·마디 수와 진행 중 요청을 공유한다. */
export function useHarumadiLibrary(ownerId?: string) {
  const client = useQueryClient();
  const query = useQuery({
    // Separate from the former partial/infinite cache. Prefix invalidations still apply.
    queryKey: ["library-harumadis", ownerId, "all"],
    queryFn: ({ signal }) => fetchAllHarumadis(ownerId!, signal),
    enabled: Boolean(ownerId), staleTime: 30_000, retry: false,
    gcTime: 5 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: true,
  });
  const shelf = displayFirstMadiShelf(query.data?.pages, query.dataUpdatedAt, query.isError, readFirstMadiShelf(client, ownerId));
  return { ...query, shelf, isFirstMadi: Boolean(ownerId && !shelf.preview && query.isSuccess && query.data?.pages[0]?.recordCount === 0) };
}
