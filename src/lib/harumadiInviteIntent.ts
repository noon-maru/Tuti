import { preferencesStorage } from "./storage/preferencesStorage";
import { INVITE_TOKEN } from "@/shared/api/harumadiTogether";
const KEY = "tuti:harumadi-invite-intent-v1";
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
  if (token) await preferencesStorage.setItem(KEY, JSON.stringify({ token, expires: Date.now() + 7 * 86400_000 }));
  return token;
}
export async function pendingHarumadiInvite() {
  try {
    const value = JSON.parse(await preferencesStorage.getItem(KEY) ?? "null");
    return value && INVITE_TOKEN.test(value.token) && Number.isFinite(value.expires) && value.expires > Date.now() ? value.token as string : null;
  } catch { return null; }
}
export const clearHarumadiInvite = () => preferencesStorage.removeItem(KEY);
