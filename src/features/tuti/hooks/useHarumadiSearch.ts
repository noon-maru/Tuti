"use client";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchHarumadis } from "@/lib/harumadis";

export function useHarumadiSearch(ownerId: string) {
  const [search, setSearch] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(search.trim().slice(0, 100)), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: ["harumadi-search", ownerId, settled], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchHarumadis(ownerId, pageParam, settled),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: Boolean(settled), retry: false, gcTime: 0,
  });
  return { search, setSearch, query, searching: Boolean(search.trim()), waiting: search.trim().slice(0, 100) !== settled };
}
