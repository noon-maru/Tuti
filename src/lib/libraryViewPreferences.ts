import { preferencesStorage } from "./storage/preferencesStorage";
import { DEFAULT_LIBRARY_VIEW, parseLibraryView, type HarumadiLibraryView } from "@/shared/harumadi/libraryView";

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
export function createLibraryViewPreferences(storage: Storage) {
  const views = new Map<string, HarumadiLibraryView>(), versions = new Map<string, number>();
  const key = (owner: string) => `tuti-library-view:${owner}`;
  const peek = (owner: string) => views.get(owner) ?? DEFAULT_LIBRARY_VIEW;
  return {
    peek,
    async load(owner: string) {
      const version = versions.get(owner) ?? 0;
      try {
        const value = parseLibraryView(await storage.getItem(key(owner)));
        // A tap while native storage is loading must win over the old value.
        if ((versions.get(owner) ?? 0) === version) views.set(owner, value);
      } catch { /* Keep the in-memory choice if local preferences are unavailable. */ }
      return peek(owner);
    },
    async save(owner: string, value: HarumadiLibraryView) {
      views.set(owner, value); versions.set(owner, (versions.get(owner) ?? 0) + 1);
      await storage.setItem(key(owner), value).catch(() => {});
    },
  };
}
export const libraryViewPreferences = createLibraryViewPreferences(preferencesStorage);
