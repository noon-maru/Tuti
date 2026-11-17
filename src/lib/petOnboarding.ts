import { preferencesStorage } from "./storage/preferencesStorage";
import { readLibraryEntryCompleted } from "./libraryPreferences";

const completedOwners = new Set<string>();
const key = (ownerId: string) => `tuti-pet-onboarding:${ownerId}`;

export function hasPetOnboardingCompleted(ownerId: string) {
  return completedOwners.has(ownerId);
}
export async function readPetOnboardingCompleted(ownerId: string) {
  if (!ownerId) return false;
  if (hasPetOnboardingCompleted(ownerId)) return true;
  const [decision, established] = await Promise.all([
    preferencesStorage.getItem(key(ownerId)).catch(() => null),
    readLibraryEntryCompleted(ownerId),
  ]);
  const completed = decision === "complete" || established;
  if (completed) completedOwners.add(ownerId);
  return completed;
}
export async function markPetOnboardingCompleted(ownerId: string) {
  if (!ownerId) return;
  completedOwners.add(ownerId);
  await preferencesStorage.setItem(key(ownerId), "complete").catch(() => {});
}
export async function clearPetOnboardingCompleted(ownerId: string) {
  completedOwners.delete(ownerId);
  await preferencesStorage.removeItem(key(ownerId)).catch(() => {});
}

/** Do not interrupt login, rights requests, shared reading or invite acceptance. */
export function isPetOnboardingStartPath(pathname: string) {
  return ["/", "/entry", "/explore", "/madi/new"].includes(pathname);
}
