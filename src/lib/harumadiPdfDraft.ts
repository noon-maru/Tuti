import { preferencesStorage } from "./storage/preferencesStorage";
import type { StateStorage } from "zustand/middleware";
import { HISTORIC_HARUMADI_DRAFT_PREFIXES } from "@/shared/harumadi/legacy";
import {
  parseHarumadiPdfDraft,
  type HarumadiPdfDraft,
} from "../shared/api/harumadiPdf";

const PREFIX = "tuti-harumadi-pdf-v1:";
export function createHarumadiPdfDraftStorage(storage: StateStorage) {
  const writes = new Map<string, Promise<void>>();
  const revisions = new Map<string, number>();

  async function loadHarumadiPdfDraft(ownerId: string) {
    await writes.get(ownerId)?.catch(() => {});
    const revision = revisions.get(ownerId) ?? 0;
    const current = await storage.getItem(PREFIX + ownerId);
    let raw = current;
    for (const prefix of HISTORIC_HARUMADI_DRAFT_PREFIXES) if (raw === null || raw === undefined) raw = await storage.getItem(prefix + ownerId);
    if (!raw) return null;
    const draft = parseHarumadiPdfDraft(JSON.parse(raw));
    if (!draft) throw new Error("저장된 초안을 읽지 못했어요.");
    if (current === null || current === undefined) {
      // 새 저장이 경합하면 큐 안에서 현재 값을 재확인해 이전 초안으로 덮지 않는다.
      await enqueue(ownerId, async () => {
        if ((revisions.get(ownerId) ?? 0) !== revision) return;
        if (!await storage.getItem(PREFIX + ownerId)) await storage.setItem(PREFIX + ownerId, JSON.stringify(draft));
        for (const prefix of HISTORIC_HARUMADI_DRAFT_PREFIXES) await storage.removeItem(prefix + ownerId);
      });
      const latest = await storage.getItem(PREFIX + ownerId);
      if (latest) return parseHarumadiPdfDraft(JSON.parse(latest));
      return null;
    }
    return draft;
  }

  function saveHarumadiPdfDraft(ownerId: string, draft: HarumadiPdfDraft) {
    revisions.set(ownerId, (revisions.get(ownerId) ?? 0) + 1);
    return enqueue(ownerId, () =>
      storage.setItem(PREFIX + ownerId, JSON.stringify(draft)),
    );
  }

  function removeHarumadiPdfDraft(ownerId: string) {
    revisions.set(ownerId, (revisions.get(ownerId) ?? 0) + 1);
    return enqueue(ownerId, async () => {
      await storage.removeItem(PREFIX + ownerId);
      for (const prefix of HISTORIC_HARUMADI_DRAFT_PREFIXES) await storage.removeItem(prefix + ownerId);
    });
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
  return { loadHarumadiPdfDraft, saveHarumadiPdfDraft, removeHarumadiPdfDraft };
}

export const {
  loadHarumadiPdfDraft,
  saveHarumadiPdfDraft,
  removeHarumadiPdfDraft,
} = createHarumadiPdfDraftStorage(preferencesStorage);
