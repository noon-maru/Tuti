"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalEntries,
  updateJournalEntry,
} from "@/lib/tutiApi";
import type {
  JournalEntryInput,
  TutiJournalEntry,
} from "@/shared/api/journal";

const journalEntriesQueryKey = ["journal-entries"] as const;

export function useTutiJournalEntries() {
  const queryClient = useQueryClient();
  const { data: entries = [], ...query } = useQuery({
    queryKey: journalEntriesQueryKey,
    queryFn: fetchJournalEntries,
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: (entry) => {
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey,
        (currentEntries = []) => [entry, ...currentEntries],
      );
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      entryId,
      input,
    }: {
      entryId: string;
      input: JournalEntryInput;
    }) => updateJournalEntry(entryId, input),
    onSuccess: (entry) => {
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey,
        (currentEntries = []) =>
          currentEntries.map((currentEntry) =>
            currentEntry.id === entry.id ? entry : currentEntry,
          ),
      );
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteJournalEntry,
    onSuccess: (entryId) => {
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey,
        (currentEntries = []) =>
          currentEntries.filter((entry) => entry.id !== entryId),
      );
    },
  });
  const addEntry = useCallback(
    (input: JournalEntryInput) => createMutation.mutateAsync(input),
    [createMutation.mutateAsync],
  );
  const updateEntry = useCallback(
    (entryId: string, input: JournalEntryInput) =>
      updateMutation.mutateAsync({ entryId, input }),
    [updateMutation.mutateAsync],
  );
  const removeEntry = useCallback(
    (entryId: string) => deleteMutation.mutateAsync(entryId),
    [deleteMutation.mutateAsync],
  );

  return {
    entries,
    addEntry,
    removeEntry,
    updateEntry,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdating: updateMutation.isPending,
    ...query,
  };
}
