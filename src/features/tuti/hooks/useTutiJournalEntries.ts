"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "./useSession";
import { isSessionCurrent } from "@/lib/auth/session";
import type { TutiSession } from "@/shared/api/session";
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

export const journalEntriesQueryKey = (owner?: string) => ["journal-entries", owner] as const;

function requireOwner(session: TutiSession | null) {
  if (!session || !isSessionCurrent(session)) throw new Error("계정이 변경되었어요. 다시 확인해주세요.");
  return session;
}

function refreshJournalDependents(client: QueryClient, owner: string) {
  client.removeQueries({ queryKey: ["library-cover", owner] });
  return Promise.all(["harumadi-pdfs", "library-harumadiPdfs", "library-harumadis", "harumadi-entries"]
    .map(prefix => client.invalidateQueries({ queryKey: [prefix, owner] })));
}

export function useTutiJournalEntries(enabled = true) {
  const queryClient = useQueryClient();
  const session = useSession();
  const { data: entries = [], ...query } = useQuery({
    queryKey: journalEntriesQueryKey(session?.userId),
    queryFn: ({ signal }) => fetchJournalEntries(requireOwner(session), signal),
    enabled: enabled && Boolean(session),
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: ({ input, session }: { input: JournalEntryInput; session: TutiSession }) => createJournalEntry(input, requireOwner(session)),
    onSuccess: (entry, { session }) => {
      requireOwner(session);
      void refreshJournalDependents(queryClient, session.userId);
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey(session.userId),
        (currentEntries = []) => [entry, ...currentEntries],
      );
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      entryId,
      input,
      session,
    }: {
      entryId: string;
      input: JournalEntryInput;
      session: TutiSession;
    }) => updateJournalEntry(entryId, input, requireOwner(session)),
    onSuccess: (entry, { session }) => {
      requireOwner(session);
      void refreshJournalDependents(queryClient, session.userId);
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey(session.userId),
        (currentEntries = []) =>
          currentEntries.map((currentEntry) =>
            currentEntry.id === entry.id ? entry : currentEntry,
          ),
      );
    },
  });
  const deleteMutation = useMutation({
    mutationFn: ({ entryId, session }: { entryId: string; session: TutiSession }) => deleteJournalEntry(entryId, requireOwner(session)),
    onError: async (_error, { session }) => {
      if (!isSessionCurrent(session)) return;
      // 철회가 접수됐지만 파일 정리가 남은 경우 예전 본문·사진을 계속 표시하지 않는다.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: journalEntriesQueryKey(session.userId) }),
        refreshJournalDependents(queryClient, session.userId),
      ]);
    },
    onSuccess: (entryId, { session }) => {
      requireOwner(session);
      void refreshJournalDependents(queryClient, session.userId);
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey(session.userId),
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
      session,
    }: {
      entryId: string;
      published: boolean;
      consentVersion?: string;
      session: TutiSession;
    }) => setJournalEntryPublication(entryId, published, consentVersion, requireOwner(session)),
    onSuccess: (entry, { session }) => {
      requireOwner(session);
      queryClient.setQueryData<TutiJournalEntry[]>(
        journalEntriesQueryKey(session.userId),
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
    (input: JournalEntryInput) => createEntry({ input, session: requireOwner(session) }),
    [createEntry, session],
  );
  const updateEntry = useCallback(
    (entryId: string, input: JournalEntryInput) =>
      updateCurrentEntry({ entryId, input, session: requireOwner(session) }),
    [updateCurrentEntry, session],
  );
  const removeEntry = useCallback(
    (entryId: string) => deleteCurrentEntry({ entryId, session: requireOwner(session) }),
    [deleteCurrentEntry, session],
  );
  const changeEntryPublication = useCallback(
    (entryId: string, published: boolean, consentVersion?: string) =>
      updatePublication({ entryId, published, consentVersion, session: requireOwner(session) }),
    [updatePublication, session],
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
