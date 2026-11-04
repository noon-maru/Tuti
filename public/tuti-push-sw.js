/* Push only: 페이지·인증·API·사진을 오프라인 캐시하지 않는다. */
const STATE_CACHE = "tuti-push-state-v1";
const OWNER = "/__tuti_push_owner";
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
function safePath(value) {
  if (typeof value !== "string" || !/^\/(?:harumadi\?|madi\/new\?|inquiry\?)/.test(value) || value.includes("\\") || /[\r\n]/.test(value)) return "/";
  const url = new URL(value, self.location.origin);
  return url.origin === self.location.origin ? url.pathname + url.search : "/";
}
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    const state = await (await caches.open(STATE_CACHE)).match(OWNER);
    const ownerTag = state ? await state.text() : null;
    // 다른 계정·로그아웃·해제 뒤 늦게 도착한 푸시는 표시하지 않는다.
    if (!ownerTag || payload?.ownerTag !== ownerTag) return;
    await self.registration.showNotification(String(payload.title || "Tuti").slice(0, 120), {
      body: String(payload.body || "새 소식을 확인해보세요.").slice(0, 240),
      icon: "/app-icons/icon-192.png", badge: "/app-icons/icon-96.png",
      tag: "tuti-lifelog", data: { path: safePath(payload.path), ownerTag },
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const state = await (await caches.open(STATE_CACHE)).match(OWNER);
    if (!state || await state.text() !== event.notification.data?.ownerTag) return;
    const path = safePath(event.notification.data?.path);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const target = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (target) { await target.navigate(path); await target.focus(); }
    else await self.clients.openWindow(path);
  })());
});
