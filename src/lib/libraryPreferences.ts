import { preferencesStorage } from "./storage/preferencesStorage";

const completedOwners = new Set<string>();

export async function readLibraryEntryCompleted(ownerId: string) {
  if (completedOwners.has(ownerId)) return true;
  try {
    const completed = await preferencesStorage.getItem(`tuti-entry-completed:${ownerId}`) === "complete";
    if (completed) completedOwners.add(ownerId);
    return completed;
  } catch { return false; }
}

export async function markLibraryEntryCompleted(ownerId: string) {
  completedOwners.add(ownerId);
  await preferencesStorage.setItem(`tuti-entry-completed:${ownerId}`, "complete").catch(() => {});
}
