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

export function useTutiJournalEntries(enabled = true) {
  const queryClient = useQueryClient();
  const { data: entries = [], ...query } = useQuery({
    queryKey: journalEntriesQueryKey,
    queryFn: fetchJournalEntries,
    enabled,
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: (entry) => {
      void queryClient.invalidateQueries({ queryKey: ["library-books"] });
      void queryClient.invalidateQueries({ queryKey: ["library-notebooks"] });
      void queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
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
      void queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      queryClient.removeQueries({ queryKey: ["library-cover"] });
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
    onError: async () => {
      // 철회가 접수됐지만 파일 정리가 남은 경우 예전 본문·사진을 계속 표시하지 않는다.
      await queryClient.invalidateQueries({ queryKey: journalEntriesQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["journal-books"] });
      await queryClient.invalidateQueries({ queryKey: ["library-books"] });
      await queryClient.invalidateQueries({ queryKey: ["library-notebooks"] });
      await queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      queryClient.removeQueries({ queryKey: ["library-cover"] });
    },
    onSuccess: (entryId) => {
      void queryClient.invalidateQueries({ queryKey: ["journal-books"] });
      void queryClient.invalidateQueries({ queryKey: ["library-notebooks"] });
      void queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["library-books"] });
      queryClient.removeQueries({ queryKey: ["library-cover"] });
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
      consentVersion,
    }: {
      entryId: string;
      published: boolean;
      consentVersion?: string;
    }) => setJournalEntryPublication(entryId, published, consentVersion),
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
    (entryId: string, published: boolean, consentVersion?: string) =>
      updatePublication({ entryId, published, consentVersion }),
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
