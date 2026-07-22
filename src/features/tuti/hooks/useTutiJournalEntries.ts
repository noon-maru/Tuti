"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJournalEntries } from "@/lib/tutiApi";

export function useTutiJournalEntries() {
  const { data: entries = [], ...query } = useQuery({
    queryKey: ["journal-entries"],
    queryFn: fetchJournalEntries,
    staleTime: Infinity,
  });

  return { entries, ...query };
}
