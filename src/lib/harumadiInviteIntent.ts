import { preferencesStorage } from "./storage/preferencesStorage";
import { INVITE_TOKEN } from "@/shared/api/harumadiTogether";
const KEY = "tuti:harumadi-invite-intent-v1";
export const HARUMADI_INVITE_CHANGED = "tuti:harumadi-invite-changed";
export function parseHarumadiInviteUrl(value: string) {
  try {
    const url = new URL(value);
    const valid = (url.protocol === "com.noonmaru.tuti:" && url.host === "harumadi" && url.pathname === "/invite") ||
      (url.protocol === "https:" && url.host === "tuti.today" && url.pathname === "/harumadi/invite") ||
      (typeof window !== "undefined" && url.origin === window.location.origin && url.pathname === "/harumadi/invite");
    const token = url.hash.slice(1);
    return valid && INVITE_TOKEN.test(token) ? token : null;
  } catch { return null; }
}
export async function rememberHarumadiInviteUrl(url: string) {
  const token = parseHarumadiInviteUrl(url);
  if (token) {
    await preferencesStorage.setItem(KEY, JSON.stringify({ token, expires: Date.now() + 7 * 86400_000, resume: true }));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(HARUMADI_INVITE_CHANGED));
  }
  return token;
}
export async function pendingHarumadiInvite(resumeOnly = false) {
  try {
    const value = JSON.parse(await preferencesStorage.getItem(KEY) ?? "null");
    return value && INVITE_TOKEN.test(value.token) && Number.isFinite(value.expires) && value.expires > Date.now() && (!resumeOnly || value.resume === true) ? value.token as string : null;
  } catch { return null; }
}
export async function setHarumadiInviteResume(resume: boolean) {
  try {
    const value = JSON.parse(await preferencesStorage.getItem(KEY) ?? "null");
    if (value && INVITE_TOKEN.test(value.token)) await preferencesStorage.setItem(KEY, JSON.stringify({ ...value, resume }));
  } catch { /* A new link can always restore the invitation if local storage is unavailable. */ }
}
export const clearHarumadiInvite = () => preferencesStorage.removeItem(KEY);
