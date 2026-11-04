import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("웹 워커는 현재 계정만 표시하고 클릭은 내부 경로만 열며 API·페이지 캐시를 설치하지 않는다", async () => {
  type Event = { waitUntil: (value: Promise<unknown>) => void; data?: { json: () => unknown }; notification?: { close: () => void; data: unknown } };
  const listeners = new Map<string, (event: Event) => void>();
  let owner: string | null = "current-owner";
  const shown: { title: string; options: { data: { path: string; ownerTag: string } } }[] = [];
  const navigated: string[] = [];
  let focused = 0, closed = 0;
  const code = readFileSync("public/tuti-push-sw.js", "utf8");
  runInNewContext(code, {
    URL, caches: { open: async () => ({ match: async () => owner ? { text: async () => owner } : undefined }) },
    self: {
      location: { origin: "https://tuti.today" },
      addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
      registration: { showNotification: async (title: string, options: { data: { path: string; ownerTag: string } }) => shown.push({ title, options }) },
      clients: { matchAll: async () => [{ url: "https://tuti.today/", navigate: async (path: string) => navigated.push(path), focus: async () => focused++ }], openWindow: async (path: string) => navigated.push(path) },
    },
  });
  async function push(payload: unknown) {
    let pending!: Promise<unknown>;
    listeners.get("push")!({ data: { json: () => payload }, waitUntil: value => { pending = value; } });
    await pending;
  }
  await push({ ownerTag: "other-owner", title: "다른 계정", path: "/madi/new?from=notification" });
  assert.equal(shown.length, 0);
  await push({ ownerTag: owner, title: "오늘의 마디", body: "오늘을 남겨볼까요?", path: "/madi/new?from=notification&notificationId=test" });
  assert.equal(shown.length, 1);
  async function click(data: unknown) {
    let pending!: Promise<unknown>;
    listeners.get("notificationclick")!({ notification: { data, close: () => { closed++; } }, waitUntil: value => { pending = value; } });
    await pending;
  }
  await click(shown[0].options.data);
  assert.equal(navigated[0], "/madi/new?from=notification&notificationId=test");
  assert.equal(focused, 1);
  await click({ ownerTag: owner, path: "https://evil.test/" });
  assert.equal(navigated.at(-1), "/");
  owner = null;
  const count = navigated.length;
  await push({ ownerTag: "current-owner", title: "해제 후 늦은 알림" });
  await click(shown[0].options.data);
  assert.equal(shown.length, 1); assert.equal(navigated.length, count); assert.equal(closed, 3);
  assert.equal(listeners.has("fetch"), false);
  assert.doesNotMatch(code, /Authorization|accessToken|fetch\(/);
});
