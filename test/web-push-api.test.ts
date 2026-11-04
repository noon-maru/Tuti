import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";
import webPush from "web-push";

test("웹 등록은 계정 이전을 거절하고 전체 구독 증명으로만 브라우저 철회를 허용한다", async t => {
  const old = { ...process.env }, keys = webPush.generateVAPIDKeys();
  Object.assign(process.env, { WEB_PUSH_ENABLED: "true", WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey, WEB_PUSH_VAPID_SUBJECT: "mailto:synthetic@example.com" });
  t.after(() => { for (const name of ["WEB_PUSH_ENABLED", "WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT"]) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; } });
  const sub = { endpoint: "https://web.push.apple.com/synthetic", keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString("base64url") } };
  const installationId = `web_${createHash("sha256").update(sub.endpoint).digest("hex")}`;
  let actor = "a", writes = 0;
  let device: { userId: string; installationId: string; token: string; platform: string } | null = null;
  const tx = {
    $queryRaw: async () => [{ id: actor }],
    pushDevice: {
      findUnique: async () => device,
      count: async () => 0,
      upsert: async ({ create }: { create: typeof device }) => { writes++; device = create; },
      deleteMany: async ({ where }: { where: { userId?: string; installationId: string; platform?: string; token?: string } }) => {
        if (device && device.installationId === where.installationId && (!where.userId || device.userId === where.userId) && (!where.token || device.token === where.token) && (!where.platform || device.platform === where.platform)) device = null;
      },
    },
  };
  (globalThis as { prisma?: unknown }).prisma = { ...tx, user: { findUnique: async () => ({ id: actor, role: "user", lastAccessedAt: new Date(), authIdentities: [] }) }, $transaction: async (action: (value: typeof tx) => unknown) => action(tx) };
  const route = await import("@/app/api/push/devices/route");
  const configRoute = await import("@/app/api/push/web/route");
  function request(body: unknown, method = "POST", authenticated = true, origin = "https://tuti.today") {
    return new Request("https://tuti.today/api/push/devices", { method, headers: { Origin: origin, "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${"a".repeat(40)}` } : {}) }, body: JSON.stringify(body) });
  }
  assert.equal((await route.POST(request({}, "POST", false))).status, 401);
  assert.equal((await route.POST(request({}, "POST", true, "https://evil.test"))).status, 403);
  const input = { installationId: "synthetic-installation", platform: "web", token: JSON.stringify(sub) };
  assert.equal((await route.POST(request(input))).status, 200);
  assert.equal(device!.installationId, installationId); assert.equal(writes, 1);
  actor = "b";
  assert.equal((await route.POST(request({ ...input, installationId, platform: "android" }))).status, 400, "네이티브 등록 경로로 웹 소유권 검사를 우회하지 못한다");
  assert.equal((await route.POST(request(input))).status, 400);
  assert.equal(writes, 1, "다른 계정의 브라우저를 자동 이전하지 않는다");
  assert.equal((await route.DELETE(request({ installationId }, "DELETE"))).status, 204);
  assert.ok(device, "설치 ID만으로 타 계정의 기기를 삭제하지 못한다");
  assert.equal((await route.DELETE(request({ installationId, webSubscription: { ...sub, keys: { ...sub.keys, auth: "short" } } }, "DELETE"))).status, 400);
  assert.ok(device);
  assert.equal((await route.DELETE(request({ installationId, webSubscription: sub }, "DELETE"))).status, 204);
  assert.equal(device, null, "해당 브라우저의 전체 구독 자격 증명이 있어야 계정 전환 후 철회한다");
  const response = await configRoute.GET(new Request("https://tuti.today/api/push/web", { headers: { Authorization: `Bearer ${"a".repeat(40)}` } }));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { enabled: true, publicKey: keys.publicKey });
});
