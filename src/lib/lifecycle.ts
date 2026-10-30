"use client";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import { nextActivityClock, type ActivityClock } from "@/shared/analytics/lifecycleClock";
import type { ClientLifecycleName, LifecycleContext, LifecycleInput } from "@/shared/api/lifecycle";
import { LIFECYCLE_UUID } from "@/shared/api/lifecycle";

let clock: ActivityClock | null = null, flowId: string | undefined, flowOwner: string | undefined;
let version: string | undefined;
let restored = false;
const pending = new Map<string, { owner: string; event: LifecycleInput; at: number }>();
let flushing = false;
export function clearLifecycleClient(owner: string) {
  for (const [id, item] of pending) if (item.owner === owner) pending.delete(id);
  if (clock?.owner === owner) { clock = null; restored = true; }
  if (flowOwner === owner) { flowId = undefined; flowOwner = undefined; }
  try { const saved = JSON.parse(window.sessionStorage.getItem("tuti-lifecycle-clock-v1") ?? "null"); if (saved?.owner === owner) window.sessionStorage.removeItem("tuti-lifecycle-clock-v1"); } catch { /* unavailable storage */ }
}
if (typeof window !== "undefined" && Capacitor.isNativePlatform()) void App.getInfo().then(info => { version = `${info.version} (${info.build})`; }).catch(() => {});

export function lifecycleSource(): LifecycleContext["source"] {
  if (typeof window === "undefined") return "unknown";
  const path = window.location.pathname, params = new URLSearchParams(window.location.search);
  if (path.startsWith("/harumadi/invite")) return "invite";
  if (path.startsWith("/explore") || params.get("from") === "explore") return "explore";
  if (path.startsWith("/harumadi") || params.has("harumadiId")) return "book";
  return "home";
}
function context(): LifecycleContext {
  const platform = Capacitor.getPlatform();
  return { source: lifecycleSource(), platform: platform === "android" || platform === "ios" ? platform : "web",
    appVersion: version, sessionId: clock?.sessionId, ...(flowOwner === getSessionSnapshot()?.userId ? { flowId } : {}) };
}
function enqueue(owner: string, name: ClientLifecycleName, extras: Partial<LifecycleInput> = {}) {
  if (pending.size >= 100) pending.delete(pending.keys().next().value!);
  const event = { id: crypto.randomUUID(), observedAt: new Date().toISOString(), ...context(), ...extras, name } as LifecycleInput;
  pending.set(event.id, { owner, event, at: Date.now() });
}
export function observeActivity() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  const owner = getSessionSnapshot()?.userId;
  if (!owner) return;
  if (!restored) {
    restored = true;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem("tuti-lifecycle-clock-v1") ?? "null") as ActivityClock | null;
      if (saved && typeof saved.owner === "string" && LIFECYCLE_UUID.test(saved.sessionId) && Number.isFinite(saved.lastAt) && Number.isInteger(saved.day)) clock = saved;
    } catch { /* Browser storage may be unavailable. */ }
  }
  for (const [id, item] of pending) if (item.owner !== owner) pending.delete(id);
  const next = nextActivityClock(clock, owner, Date.now(), () => crypto.randomUUID());
  clock = next.clock;
  try { window.sessionStorage.setItem("tuti-lifecycle-clock-v1", JSON.stringify(clock)); } catch { /* memory fallback */ }
  if (next.newSession) enqueue(owner, "session_started");
  if (next.newDay) enqueue(owner, "daily_active");
  void flushLifecycle();
}
export function trackLifecycle(name: ClientLifecycleName, extras: Partial<LifecycleInput> = {}) {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  const owner = getSessionSnapshot()?.userId;
  if (!owner) return;
  observeActivity();
  if (name === "compose_started") { flowId = crypto.randomUUID(); flowOwner = owner; }
  enqueue(owner, name, extras);
  void flushLifecycle();
}
export function lifecycleHeaders(): Record<string, string> {
  observeActivity();
  const value = context();
  return Object.fromEntries(Object.entries({ "x-tuti-source": value.source, "x-tuti-platform": value.platform,
    "x-tuti-version": value.appVersion, "x-tuti-session": value.sessionId, "x-tuti-flow": value.flowId }).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
export async function flushLifecycle() {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
  flushing = true;
  try {
    for (const [id, item] of pending) {
      if (item.owner !== getSessionSnapshot()?.userId || Date.now() - item.at > 30 * 60_000) { pending.delete(id); continue; }
      const response = await fetchWithPinnedSession("lifecycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.event), keepalive: true }, item.owner);
      if (response.ok || [400, 401, 403, 404, 409, 423, 426, 428].includes(response.status)) pending.delete(id);
      else break;
    }
  } catch { /* In-memory bounded retries only; telemetry never blocks the user. */ }
  finally { flushing = false; }
}
