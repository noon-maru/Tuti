"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchJournalEntries } from "@/lib/tutiApi";
import type { TutiJournalEntry } from "@/shared/api/journal";

const journalEntriesQueryKey = ["journal-entries"] as const;

export function useTutiJournalEntries() {
  const queryClient = useQueryClient();
  const { data: entries = [], ...query } = useQuery({
    queryKey: journalEntriesQueryKey,
    queryFn: fetchJournalEntries,
    staleTime: Infinity,
  });

  const addEntry = useCallback(
    (entry: TutiJournalEntry) => {
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey,
        (currentEntries = []) => [entry, ...currentEntries],
      );
    },
    [queryClient],
  );
  const updateEntry = useCallback(
    (entry: TutiJournalEntry) => {
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey,
        (currentEntries = []) =>
          currentEntries.map((currentEntry) =>
            currentEntry.id === entry.id ? entry : currentEntry,
          ),
      );
    },
    [queryClient],
  );
  const removeEntry = useCallback(
    (entryId: string) => {
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey,
        (currentEntries = []) =>
          currentEntries.filter((entry) => entry.id !== entryId),
      );
    },
    [queryClient],
  );

  return { entries, addEntry, removeEntry, updateEntry, ...query };
}
