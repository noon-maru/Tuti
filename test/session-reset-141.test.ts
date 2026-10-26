import assert from "node:assert/strict";
import test from "node:test";
import { Capacitor } from "@capacitor/core";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { createOrderedStorage } from "@/lib/storage/orderedStorage";
import { createSessionReset, SESSION_RESET_MARKER } from "@/lib/auth/sessionMigration";
import { readStoredSession } from "@/lib/auth/session";

test("1.4.1은 이전 로그인·미완료 약관 표시만 한 번 지우고 기록·초안·푸시 설정은 보존한다", async () => {
  const data = new Map([
    ["tuti-session", "old-session"], ["tuti-initial-terms-pending", "true"],
    ["tuti-harumadi-pdf-v1:old-owner", "private-draft"], ["tuti-push-privacy-v1", "private-push-state"], ["tuti-state", "preferences"],
  ]);
  const removed: string[] = [];
  const storage = { getItem: async (key: string) => data.get(key) ?? null, setItem: async (key: string, value: string) => { data.set(key, value); }, removeItem: async (key: string) => { removed.push(key); data.delete(key); } };
  const reset = createSessionReset(storage);
  await Promise.all([reset(), reset(), reset()]);
  assert.deepEqual(removed, ["tuti-session", "tuti-initial-terms-pending"]);
  assert.equal(data.get(SESSION_RESET_MARKER), "done");
  assert.equal(data.get("tuti-harumadi-pdf-v1:old-owner"), "private-draft");
  assert.equal(data.get("tuti-push-privacy-v1"), "private-push-state");
  assert.equal(data.get("tuti-state"), "preferences");
  data.set("tuti-session", "new-session");
  await reset();
  await createSessionReset(storage)(); // 다음 앱 실행·후속 패치에도 재로그아웃하지 않는다.
  assert.equal(data.get("tuti-session"), "new-session");
});

test("정리 쓰기가 실패하면 완료로 표시하지 않고 ordered storage에서도 다시 시도한다", async () => {
  const data = new Map([["tuti-session", "old-session"]]);
  let fail = true;
  const storage = createOrderedStorage({ getItem: async key => data.get(key) ?? null,
    removeItem: async key => { if (fail) { fail = false; throw new Error("storage failure"); } data.delete(key); },
    setItem: async (key, value) => { data.set(key, value); },
  });
  const reset = createSessionReset(storage);
  await assert.rejects(reset(), /storage failure/);
  assert.equal(data.has(SESSION_RESET_MARKER), false);
  await reset();
  assert.equal(data.has("tuti-session"), false);
  assert.equal(data.get(SESSION_RESET_MARKER), "done");
});

test("웹 세션은 유지하고 네이티브에서는 세션 조회 전에 정리하며 계정·동의를 만들지 않는다", async t => {
  const session = { userId: "old", accessToken: "x".repeat(40) };
  const data = new Map([["tuti-session", JSON.stringify(session)]]);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected network"); });
  t.mock.method(preferencesStorage, "getItem", async (key: string) => data.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { data.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { data.delete(key); });
  t.mock.method(Capacitor, "isNativePlatform", () => false);
  assert.deepEqual(await readStoredSession(), session);
  t.mock.method(Capacitor, "isNativePlatform", () => true);
  assert.equal(await readStoredSession(), null);
  assert.equal(data.get(SESSION_RESET_MARKER), "done");
  assert.equal(requests, 0);
});
