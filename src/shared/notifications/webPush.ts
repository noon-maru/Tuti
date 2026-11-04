export type WebPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

// 등록값이 발송 URL이 되므로 임의 호스트로의 중계는 허용하지 않는다.
const providers = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
export function parseWebPushSubscription(value: unknown): WebPushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<WebPushSubscription>;
  if (typeof v.endpoint !== "string" || v.endpoint.length > 2048 || !v.keys) return null;
  try {
    const url = new URL(v.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) return null;
    if (!providers.includes(url.hostname) && !url.hostname.endsWith(".push.apple.com") && !url.hostname.endsWith(".notify.windows.com")) return null;
    if (url.pathname === "/") return null;
    const { p256dh, auth } = v.keys;
    if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) ||
      typeof auth !== "string" || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(auth)) return null;
    // 공개 키는 압축하지 않은 P-256 형식(65바이트, 0x04)만 받는다.
    const key = atob(p256dh.replaceAll("-", "+").replaceAll("_", "/"));
    if (key.length !== 65 || key.charCodeAt(0) !== 4) return null;
    return { endpoint: url.href, keys: { p256dh: p256dh.replace(/=+$/, ""), auth: auth.replace(/=+$/, "") } };
  } catch { return null; }
}

export function notificationPath(path: unknown, notificationId?: unknown) {
  if (typeof path !== "string" || !/^\/(?:harumadi\?|madi\/new\?|inquiry\?)/.test(path) || path.includes("\\") || /[\r\n]/.test(path)) return "/";
  const url = new URL(path, "https://tuti.today");
  if (url.origin !== "https://tuti.today") return "/";
  if (typeof notificationId === "string" && notificationId.length <= 200) url.searchParams.set("notificationId", notificationId);
  return url.pathname + url.search;
}
