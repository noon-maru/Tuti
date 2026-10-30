export const LIFECYCLE_SOURCES = ["home", "explore", "book", "invite", "unknown"] as const;
export const LIFECYCLE_PLATFORMS = ["web", "android", "ios", "unknown"] as const;
export const LIFECYCLE_ORIGINS = ["manual", "first_madi_auto", "existing_selection", "within_book", "download", "share_sheet", "cancelled", "request_failed"] as const;
export const CLIENT_LIFECYCLE_NAMES = ["home_viewed", "explore_viewed", "compose_started", "compose_exited", "draft_restored", "book_opened", "invite_viewed", "purchase_viewed", "purchase_clicked", "pdf_exported", "compose_failed", "pdf_failed", "invite_failed", "daily_active", "session_started"] as const;
export type ClientLifecycleName = typeof CLIENT_LIFECYCLE_NAMES[number];
export type LifecycleName = ClientLifecycleName | "madi_created" | "harumadi_created" | "madi_added" | "invite_created" | "invite_accepted" | "shared_first_contribution" | "pdf_created";
export type LifecycleContext = { source?: typeof LIFECYCLE_SOURCES[number]; platform?: typeof LIFECYCLE_PLATFORMS[number]; appVersion?: string; sessionId?: string; flowId?: string };
export type LifecycleInput = LifecycleContext & { id: string; name: ClientLifecycleName; entityId?: string; observedAt?: string; origin?: typeof LIFECYCLE_ORIGINS[number] };
export const LIFECYCLE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const lifecycleId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function lifecycleContext(value: Record<string, unknown>): LifecycleContext {
  return {
    source: LIFECYCLE_SOURCES.includes(value.source as never) ? value.source as LifecycleContext["source"] : "unknown",
    platform: LIFECYCLE_PLATFORMS.includes(value.platform as never) ? value.platform as LifecycleContext["platform"] : "unknown",
    ...(typeof value.appVersion === "string" && /^[\w. ()+-]{1,40}$/.test(value.appVersion) ? { appVersion: value.appVersion } : {}),
    ...(typeof value.sessionId === "string" && LIFECYCLE_UUID.test(value.sessionId) ? { sessionId: value.sessionId } : {}),
    ...(typeof value.flowId === "string" && LIFECYCLE_UUID.test(value.flowId) ? { flowId: value.flowId } : {}),
  };
}
export function parseLifecycleInput(value: unknown): LifecycleInput | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !LIFECYCLE_UUID.test(v.id) || !CLIENT_LIFECYCLE_NAMES.includes(v.name as never)) return null;
  if (v.entityId !== undefined && !lifecycleId(v.entityId)) return null;
  if (v.observedAt !== undefined && (typeof v.observedAt !== "string" || v.observedAt.length > 30 || !Number.isFinite(Date.parse(v.observedAt)))) return null;
  if (v.origin !== undefined && !["download", "share_sheet", "cancelled", "request_failed"].includes(String(v.origin))) return null;
  return { id: v.id, name: v.name as ClientLifecycleName, ...lifecycleContext(v),
    ...(v.entityId ? { entityId: v.entityId as string } : {}), ...(v.observedAt ? { observedAt: v.observedAt as string } : {}), ...(v.origin ? { origin: v.origin as LifecycleInput["origin"] } : {}) };
}
