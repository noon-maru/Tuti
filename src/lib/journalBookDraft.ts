import { preferencesStorage } from "./storage/preferencesStorage";
import type { StateStorage } from "zustand/middleware";
import {
  parseJournalBookDraft,
  type JournalBookDraft,
} from "../shared/api/journalBook";

const PREFIX = "tuti-journal-book-v1:";
export function createJournalBookDraftStorage(storage: StateStorage) {
  const writes = new Map<string, Promise<void>>();

  async function loadJournalBookDraft(ownerId: string) {
    await writes.get(ownerId)?.catch(() => {});
    const raw = await storage.getItem(PREFIX + ownerId);
    if (!raw) return null;
    const draft = parseJournalBookDraft(JSON.parse(raw));
    if (!draft) throw new Error("저장된 초안을 읽지 못했어요.");
    return draft;
  }

  function saveJournalBookDraft(ownerId: string, draft: JournalBookDraft) {
    return enqueue(ownerId, () =>
      storage.setItem(PREFIX + ownerId, JSON.stringify(draft)),
    );
  }

  function removeJournalBookDraft(ownerId: string) {
    return enqueue(ownerId, () => storage.removeItem(PREFIX + ownerId));
  }

  function enqueue(ownerId: string, operation: () => unknown) {
    const write = (writes.get(ownerId) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        await operation();
      });
    writes.set(ownerId, write);
    void write
      .finally(() => {
        if (writes.get(ownerId) === write) writes.delete(ownerId);
      })
      .catch(() => {});
    return write;
  }
  return { loadJournalBookDraft, saveJournalBookDraft, removeJournalBookDraft };
}

export const {
  loadJournalBookDraft,
  saveJournalBookDraft,
  removeJournalBookDraft,
} = createJournalBookDraftStorage(preferencesStorage);
