import { preferencesStorage } from "./storage/preferencesStorage";
import type { StateStorage } from "zustand/middleware";

export type MadiDraft = {
  title: string; content: string; date: string; place: string; placeId: string | null;
  image: string | null; originalImage: boolean; stage?: "photo" | "write" | "preview";
};
const PREFIX = "tuti-madi-drafts-v1:";
const TTL = 7 * 86400_000;
const LIMIT = 3 * 1024 * 1024;
type SavedDraft = { savedAt: number; source: string; value: MadiDraft };
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);
export function isMadiDraft(value: unknown): value is MadiDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as MadiDraft;
  return typeof draft.title === "string" && draft.title.length <= 80 && typeof draft.content === "string" && draft.content.length <= 4000 &&
    typeof draft.place === "string" && draft.place.length <= 120 && typeof draft.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) &&
    (draft.placeId === null || (typeof draft.placeId === "string" && draft.placeId.length <= 128)) && typeof draft.originalImage === "boolean" &&
    (draft.image === null || (typeof draft.image === "string" && draft.image.length <= LIMIT && /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(draft.image))) &&
    (draft.stage === undefined || ["photo", "write", "preview"].includes(draft.stage));
}

export function createMadiDraftStorage(storage: StateStorage, now = Date.now) {
  const queues = new Map<string, Promise<unknown>>(), epochs = new Map<string, number>();
  const ticket = (owner: string) => epochs.get(owner) ?? 0;
  const enqueue = <T>(owner: string, work: () => Promise<T>) => {
    const pending = (queues.get(owner) ?? Promise.resolve()).catch(() => {}).then(work);
    queues.set(owner, pending); return pending;
  };
  const read = async (owner: string): Promise<Record<string, SavedDraft>> => {
    const raw = await storage.getItem(PREFIX + owner);
    if (!raw) return {};
    try {
      if (raw.length > LIMIT) return {};
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      return Object.fromEntries(Object.entries(data).filter(([scope, item]) => {
        const draft = item as SavedDraft;
        return validId(scope) && draft && Number.isFinite(draft.savedAt) && now() >= draft.savedAt && now() - draft.savedAt <= TTL &&
          typeof draft.source === "string" && draft.source.length <= 10000 && isMadiDraft(draft.value);
      })) as Record<string, SavedDraft>;
    } catch { return {}; }
  };
  return {
    ticket,
    load: (owner: string, scope: string, source: string) => enqueue(owner, async () => {
      const draft = (await read(owner))[scope];
      return draft?.source === source ? draft.value : null;
    }),
    save: (owner: string, scope: string, source: string, value: MadiDraft, expected: number) => enqueue(owner, async () => {
      if (ticket(owner) !== expected) return;
      if (!validId(owner) || !validId(scope) || !isMadiDraft(value)) throw new Error("invalid draft");
      const data = await read(owner);
      data[scope] = { savedAt: now(), source, value };
      const kept = Object.fromEntries(Object.entries(data).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 5));
      const raw = JSON.stringify(kept);
      if (new TextEncoder().encode(raw).byteLength > LIMIT) throw new Error("draft storage limit");
      await storage.setItem(PREFIX + owner, raw);
    }),
    remove: (owner: string, scope: string) => enqueue(owner, async () => {
      const data = await read(owner); delete data[scope];
      if (Object.keys(data).length) await storage.setItem(PREFIX + owner, JSON.stringify(data));
      else await storage.removeItem(PREFIX + owner);
    }),
    clearOwner(owner: string) {
      epochs.set(owner, ticket(owner) + 1);
      return enqueue(owner, async () => { await storage.removeItem(PREFIX + owner); });
    },
  };
}
export const madiDraftStorage = createMadiDraftStorage(preferencesStorage);
