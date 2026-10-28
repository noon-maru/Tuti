"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchHarumadis } from "@/lib/harumadis";

/** 홈과 공통 내비게이션은 같은 계정의 목록·마디 수와 진행 중 요청을 공유한다. */
export function useHarumadiLibrary(ownerId?: string) {
  const query = useInfiniteQuery({
    queryKey: ["library-harumadis", ownerId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchHarumadis(ownerId!, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: Boolean(ownerId), staleTime: 30_000, retry: false,
  });
  return { ...query, isFirstMadi: Boolean(ownerId && query.isSuccess && query.data?.pages[0]?.recordCount === 0) };
}
