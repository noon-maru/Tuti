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
  setJournalEntryPublication,
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
  const publicationMutation = useMutation({
    mutationFn: ({
      entryId,
      published,
    }: {
      entryId: string;
      published: boolean;
    }) => setJournalEntryPublication(entryId, published),
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
  const createEntry = createMutation.mutateAsync;
  const updateCurrentEntry = updateMutation.mutateAsync;
  const deleteCurrentEntry = deleteMutation.mutateAsync;
  const updatePublication = publicationMutation.mutateAsync;
  const addEntry = useCallback(
    (input: JournalEntryInput) => createEntry(input),
    [createEntry],
  );
  const updateEntry = useCallback(
    (entryId: string, input: JournalEntryInput) =>
      updateCurrentEntry({ entryId, input }),
    [updateCurrentEntry],
  );
  const removeEntry = useCallback(
    (entryId: string) => deleteCurrentEntry(entryId),
    [deleteCurrentEntry],
  );
  const changeEntryPublication = useCallback(
    (entryId: string, published: boolean) =>
      updatePublication({ entryId, published }),
    [updatePublication],
  );

  return {
    entries,
    addEntry,
    removeEntry,
    changeEntryPublication,
    updateEntry,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isChangingPublication: publicationMutation.isPending,
    isUpdating: updateMutation.isPending,
    ...query,
  };
}
