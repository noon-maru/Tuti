import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { CLIENT_PROTOCOL } from "@/shared/api/clientProtocol";
import type { AppUpdatePolicyResponse } from "@/shared/api/appUpdate";

// 네이티브 브리지만 대체하고 실제 구현을 실행한다. Capacitor Proxy는 일반 mock을 지원하지 않는다.
const App = { getInfo: async () => ({ id: "today.tuti", build: "42", version: "1.4.1", name: "Tuti" }) };
const Capacitor = { isNativePlatform: () => true, getPlatform: () => "android" };
const exports: Record<string, unknown> = {};
const compiled = ts.transpileModule(readFileSync("src/lib/appUpdate.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
runInNewContext(compiled, {
  exports, URLSearchParams, AbortSignal,
  get window() { return globalThis.window; },
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  require: (name: string) => {
    if (name === "@capacitor/app") return { App };
    if (name === "@capacitor/core") return { Capacitor };
    if (name === "@capacitor/browser") return { Browser: {} };
    if (name === "@/lib/api/apiUrl") return { apiUrl: (path: string) => `https://tuti.test/api/${path}` };
    if (name === "@/shared/api/clientProtocol") return { CLIENT_PROTOCOL };
    throw new Error(`Unexpected import: ${name}`);
  },
});
const { fetchNativeAppUpdatePolicy, readCachedAppUpdatePolicy } = exports as unknown as typeof import("@/lib/appUpdate");

const policy: AppUpdatePolicyResponse = {
  platform: "android", currentVersion: "1.4.1", required: false,
  latestVersion: null, minimumVersion: null, storeUrl: null, updateAvailable: false,
};

function setup(t: TestContext) {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  t.mock.method(Capacitor, "isNativePlatform", () => true);
  t.mock.method(Capacitor, "getPlatform", () => "android");
  t.mock.method(App, "getInfo", async () => ({ id: "today.tuti", build: "42", version: "1.4.1", name: "Tuti" }));
  return values;
}

test("성공한 정책만 앱·빌드·규약과 함께 저장하고 다음 진입에서 읽는다", async t => {
  setup(t);
  assert.equal(readCachedAppUpdatePolicy(), null);
  t.mock.method(globalThis, "fetch", async () => Response.json(policy));
  await fetchNativeAppUpdatePolicy();
  assert.deepEqual(JSON.parse(JSON.stringify(readCachedAppUpdatePolicy())), {
    protocol: CLIENT_PROTOCOL, appId: "today.tuti", build: "42", policy,
  });
});

test("저장된 결과가 있어도 매번 서버를 재확인하며 네트워크 전에 실제 앱 정보를 알린다", async t => {
  setup(t);
  const order: string[] = [];
  t.mock.method(globalThis, "fetch", async () => { order.push("network"); return Response.json(policy); });
  for (let i = 0; i < 2; i++) await fetchNativeAppUpdatePolicy(identity => {
    assert.deepEqual({ ...identity }, { appId: "today.tuti", build: "42", version: "1.4.1" });
    order.push("identity");
  });
  assert.deepEqual(order, ["identity", "network", "identity", "network"]);
});

test("필수 업데이트를 저장하고 통신 실패 후에도 덮어쓰지 않는다", async t => {
  setup(t);
  const required = { ...policy, required: true, updateAvailable: true, latestVersion: "1.5.0", storeUrl: "https://play.google.com/store/apps/details?id=test" };
  t.mock.method(globalThis, "fetch", async () => Response.json(required));
  await fetchNativeAppUpdatePolicy();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  await assert.rejects(fetchNativeAppUpdatePolicy(), /offline/);
  assert.deepEqual({ ...readCachedAppUpdatePolicy()?.policy }, required);
});

test("손상·다른 플랫폼·다른 규약·잘못된 정책 캐시는 사용하지 않는다", t => {
  const values = setup(t);
  const cached = { protocol: CLIENT_PROTOCOL, appId: "today.tuti", build: "42", policy };
  for (const value of ["{", "null", JSON.stringify({ ...cached, protocol: "old" }),
    JSON.stringify({ ...cached, policy: { ...policy, platform: "ios" } }),
    JSON.stringify({ ...cached, policy: { ...policy, required: true } }),
    JSON.stringify({ ...cached, policy: { ...policy, required: true, updateAvailable: true, latestVersion: "2.0", storeUrl: "javascript:alert(1)" } }),
  ]) {
    values.set("tuti-app-update-policy", value);
    assert.equal(readCachedAppUpdatePolicy(), null);
  }
});

test("서버 응답이 실제 앱 버전과 다르면 저장하지 않는다", async t => {
  const values = setup(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...policy, currentVersion: "1.3.1" }));
  await assert.rejects(fetchNativeAppUpdatePolicy(), /app_update_policy_invalid/);
  assert.equal(values.size, 0);
});

test("브라우저는 네이티브 정책을 기다리거나 저장하지 않는다", async t => {
  setup(t);
  t.mock.method(Capacitor, "isNativePlatform", () => false);
  t.mock.method(App, "getInfo", async () => { throw new Error("must not run"); });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("must not run"); });
  assert.equal(readCachedAppUpdatePolicy(), null);
  assert.equal(await fetchNativeAppUpdatePolicy(), null);
});

test("캐시 진입은 paint 전에 결정하고 빌드 변경·최초 실패는 차단하며 API 필수 안내를 유지한다", () => {
  const source = readFileSync("src/features/tuti/components/NativeAppUpdateNotice.tsx", "utf8");
  assert.match(source, /useLayoutEffect\(\(\) =>/);
  assert.match(source, /!getNativeAppPlatform\(\) \|\| cached/);
  assert.match(source, /cached\?\.policy.required\) setPolicy\(cached.policy\)/);
  assert.match(source, /cached.build !== identity.build/);
  assert.match(source, /cached.policy.currentVersion !== identity.version/);
  assert.match(source, /cached = null;\s*setPolicy\(null\);\s*setChecked\(false\)/);
  assert.match(source, /!disposed && !cached\) setCheckFailed\(true\)/);
  assert.match(source, /window.addEventListener\(CLIENT_UPDATE_REQUIRED_EVENT, required\)/);
});

test("초기 HTML과 로컬 저장소 확인 중에는 두 진입 게이트 모두 로고를 렌더하지 않는다", () => {
  const notice = readFileSync("src/features/tuti/components/NativeAppUpdateNotice.tsx", "utf8");
  const terms = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  for (const source of [notice, terms]) {
    assert.match(source, /const \[localCheckComplete, setLocalCheckComplete\] = useState\(false\)/);
    assert.match(source, /localCheckComplete && (?:!entryRedirect && )?<TutiWordmark priority \/>/);
  }
  assert.match(terms, /if \(active\) setLocalCheckComplete\(true\)/);
});
