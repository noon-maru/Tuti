import { preferencesStorage } from "./storage/preferencesStorage";

export async function readLibraryWelcomeSeen(ownerId: string) {
  try { return await preferencesStorage.getItem(`tuti-library-welcome:${ownerId}`) === "seen"; }
  catch { return true; } // 저장소 장애로 안내 화면을 반복하지 않는다.
}
export async function markLibraryWelcomeSeen(ownerId: string) {
  try { await preferencesStorage.setItem(`tuti-library-welcome:${ownerId}`, "seen"); } catch {}
}
