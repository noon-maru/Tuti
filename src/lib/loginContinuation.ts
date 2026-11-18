import { preferencesStorage } from "./storage/preferencesStorage";
import type { StateStorage } from "zustand/middleware";

const KEY = "tuti-login-continuation-v1";
const TTL = 30 * 60_000;
const routes: Record<string, string[]> = {
  "/pets": [],
  "/": [], "/entry": ["mode", "step", "next", "returnTo"], "/explore": ["mode", "step", "harumadiId", "ownerId"], "/settings": [],
  "/madi": ["filter", "view"], "/madi/detail": ["entryId"], "/madi/edit": ["entryId", "source", "harumadiId"],
  "/madi/new": ["from", "harumadiId", "savedEntryId", "placeId", "placeName", "journeyId", "cancelTo"], "/harumadi": ["harumadiId", "mode", "focusEntryId"],
  "/harumadi/invite": [], "/harumadi/pdfs": [], "/harumadi/pdf/view": ["harumadiPdfId", "from"],
  "/inquiry": [], "/location": [], "/notifications": [], "/legal": [], "/account-deletion": [],
};

/** Return paths are navigation hints, never grants of access or automatic mutations. */
export function safeLoginReturn(value: string | null | undefined): string | null {
  if (!value || value.length > 1500 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/u.test(value)) return null;
  const url = new URL(value, "https://tuti.invalid");
  if (url.origin !== "https://tuti.invalid" || !Object.hasOwn(routes, url.pathname)) return null;
  const params = new URLSearchParams();
  for (const key of routes[url.pathname]) {
    const item = url.searchParams.get(key);
    if (!item) continue;
    if (key === "returnTo") {
      // A consent screen may wrap one action, never a chain of entry screens.
      if (item.startsWith("/entry") || item.includes("returnTo=")) continue;
      const target = safeLoginReturn(item);
      if (target) params.set(key, target);
      continue;
    }
    const valid = key === "placeName" ? /^[a-zA-Z0-9_-]{1,128}$/.test(url.searchParams.get("placeId") ?? "") && item.length <= 100 && !/[\u0000-\u001f\u007f]/u.test(item)
      : key.endsWith("Id") ? /^[a-zA-Z0-9_-]{1,128}$/.test(item)
        : key === "cancelTo" ? item === "library"
        : key === "step" ? /^\d{1,2}$/.test(item)
        : key === "filter" ? item === "unfiled"
          : key === "view" ? ["cards", "list"].includes(item)
        : key === "mode" ? ["questions", "guide", "together", "settings", "pages"].includes(item)
          : key === "next" ? item === "explore"
            : key === "source" ? ["detail", "journal", "harumadi"].includes(item)
              : ["entry", "welcome", "library", "explore", "place", "pdfs"].includes(item);
    if (valid) params.set(key, item);
  }
  return url.pathname + (params.size ? `?${params}` : "");
}
export function loginPath(returnTo: string) {
  const path = safeLoginReturn(returnTo);
  return path ? `/login?${new URLSearchParams({ returnTo: path })}` : "/login";
}
export function loginSuccessPath(path: string, ownerId?: string) {
  const safe = safeLoginReturn(path) ?? "/";
  const params = new URL(safe, "https://tuti.invalid").searchParams;
  const destination = safe.split("?")[0] === "/entry" ? safeLoginReturn(params.get("returnTo")) ?? (params.get("next") === "explore" ? "/explore" : "/") : safe;
  const url = new URL(destination, "https://tuti.invalid");
  // Auth may merge an anonymous owner into a different account ID. This is only
  // a navigation hint; the destination still fetches and checks book permissions.
  if (ownerId && /^[a-zA-Z0-9_-]{1,128}$/.test(ownerId) && url.pathname === "/explore" && url.searchParams.has("harumadiId")) {
    url.searchParams.set("ownerId", ownerId);
    return `${url.pathname}?${url.searchParams}`;
  }
  return destination;
}

export function consentEntryPath(path: string) {
  const target = safeLoginReturn(path);
  return target && !["/", "/entry"].includes(target.split("?")[0]) ? `/entry?${new URLSearchParams({ returnTo: target })}` : "/entry";
}

export function createLoginContinuation(storage: StateStorage, now = Date.now) {
  return {
    async remember(path: string | null) {
      const safe = safeLoginReturn(path);
      if (!safe) { await storage.removeItem(KEY); return; }
      await storage.setItem(KEY, JSON.stringify({ path: safe, expires: now() + TTL }));
    },
    async read() {
      try {
        const raw = await storage.getItem(KEY);
        if (!raw || raw.length > 2000) return null;
        const item = JSON.parse(raw);
        return typeof item?.path === "string" && Number.isFinite(item.expires) && item.expires > now() && item.expires <= now() + TTL
          ? safeLoginReturn(item.path) : null;
      } catch { return null; }
    },
    async clear() { await storage.removeItem(KEY); },
  };
}
export const loginContinuation = createLoginContinuation(preferencesStorage);
