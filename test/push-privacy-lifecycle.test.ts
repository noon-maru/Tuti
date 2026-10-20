import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPushPrivacyLifecycle, PushRegistrationCancelled, type PushPrivacyState } from "../src/lib/notifications/pushPrivacyLifecycle";

function fixture(initial?: PushPrivacyState) {
  let state: PushPrivacyState = initial ?? { status: "disabled", ownerId: null, serverCleanupRequired: false };
  const calls: string[] = [];
  let nativeFails = false;
  let serverFails = false;
  let storageFails = false;
  const deps = {
    async read() { return { ...state }; },
    async write(value: PushPrivacyState) {
      if (storageFails) throw new Error("storage unavailable");
      state = { ...value };
    },
    async deleteServer(ownerId: string | null) {
      calls.push(`server:${ownerId}`);
      if (serverFails) throw new Error("server unavailable");
    },
    async revokeNative() {
      calls.push("native");
      if (nativeFails) throw new Error("native unavailable");
    },
  };
  return {
    controller: createPushPrivacyLifecycle(deps), deps, calls,
    get state() { return state; },
    set nativeFails(value: boolean) { nativeFails = value; },
    set serverFails(value: boolean) { serverFails = value; },
    set storageFails(value: boolean) { storageFails = value; },
  };
}

test("새 설치는 명시적으로 켜기 전 동기화로 등록되지 않는다", async () => {
  const f = fixture();
  assert.equal(await f.controller.recover(), false);
  assert.equal(await f.controller.sync("owner", async () => { throw new Error("must not register"); }), false);
  assert.equal(await f.controller.enable("owner", async (active) => { active(); return true; }), true);
  assert.equal(f.state.status, "enabled");
  assert.equal(await f.controller.sync("owner", async () => true), true);
});

test("해제 중에는 늦은 등록이 취소되고 서버와 네이티브가 모두 정리된다", async () => {
  const f = fixture();
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const enable = f.controller.enable("owner", async (active) => {
    started(); await waiting; active(); f.calls.push("server-register"); return true;
  });
  const rejected = assert.rejects(enable, PushRegistrationCancelled);
  await ready;
  const revoke = f.controller.revoke("owner");
  assert.equal(f.state.status, "cleanup-pending");
  release();
  await Promise.all([rejected, revoke]);
  assert.ok(!f.calls.includes("server-register"));
  assert.ok(f.calls.includes("server:owner"));
  assert.ok(f.calls.includes("native"));
  assert.equal(f.state.status, "disabled");
});

test("서버 삭제 실패여도 네이티브 정리는 시도하고 다음 실행에 재시도한다", async () => {
  const f = fixture();
  f.serverFails = true;
  await assert.rejects(f.controller.revoke("owner"), /server unavailable/);
  assert.equal(f.state.status, "cleanup-pending");
  assert.ok(f.calls.includes("native"));
  f.serverFails = false;
  const restarted = createPushPrivacyLifecycle(f.deps);
  assert.equal(await restarted.recover(), false);
  assert.equal(f.state.status, "disabled");
});

test("네이티브 삭제 실패를 성공으로 표시하거나 재등록으로 우회하지 않는다", async () => {
  const f = fixture();
  f.nativeFails = true;
  await assert.rejects(f.controller.revoke("owner"), /native unavailable/);
  assert.equal(f.state.status, "cleanup-pending");
  await assert.rejects(f.controller.enable("owner", async () => { throw new Error("must not register"); }), /native unavailable/);
  f.nativeFails = false;
  assert.equal(await f.controller.enable("owner", async () => true), true);
});

test("계정 삭제 준비는 등록을 막고 서버 삭제 성공 후에는 새 익명 계정으로 해제를 보내지 않는다", async () => {
  const f = fixture({ status: "enabled", ownerId: "deleted-owner", serverCleanupRequired: true });
  await f.controller.prepareAccountDeletion("deleted-owner");
  await assert.rejects(f.controller.sync("deleted-owner", async () => true), PushRegistrationCancelled);
  f.nativeFails = true;
  await assert.rejects(f.controller.finishAccountDeletion(), /native unavailable/);
  assert.equal(f.state.status, "cleanup-pending");
  assert.equal(f.state.serverCleanupRequired, false);
  f.nativeFails = false;
  await createPushPrivacyLifecycle(f.deps).recover();
  assert.ok(!f.calls.some((call) => call.startsWith("server:")));
  assert.equal(f.state.status, "disabled");
});

test("권한을 거부하면 등록 활성 상태를 남기지 않는다", async () => {
  const f = fixture();
  assert.equal(await f.controller.enable("owner", async () => false), false);
  assert.equal(f.state.status, "disabled");
});

test("정리 의도를 저장할 수 없으면 새로운 토큰을 발급하지 않는다", async () => {
  const f = fixture();
  f.storageFails = true;
  await assert.rejects(f.controller.enable("owner", async () => { throw new Error("must not register"); }), /storage unavailable/);
  assert.deepEqual(f.calls, []);
});

test("OS 권한 철회도 다음 동기화에서 서버와 기기를 정리한다", async () => {
  const f = fixture({ status: "enabled", ownerId: "owner", serverCleanupRequired: true });
  assert.equal(await f.controller.sync("owner", async () => false), false);
  assert.equal(f.state.status, "disabled");
  assert.deepEqual(f.calls.sort(), ["native", "server:owner"]);
});

test("세션 복구 중 해제해도 이전 등록의 소유자를 잃지 않는다", async () => {
  const f = fixture({ status: "enabled", ownerId: "original-owner", serverCleanupRequired: true });
  await f.controller.revoke(null);
  assert.ok(f.calls.includes("server:original-owner"));
  assert.ok(!f.calls.includes("server:null"));
  assert.equal(f.state.status, "disabled");
});

test("이미 등록 동기화가 진행 중이어도 계정 삭제 준비가 새 등록 완료를 막는다", async () => {
  const f = fixture({ status: "enabled", ownerId: "owner", serverCleanupRequired: true });
  let started!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const sync = f.controller.sync("owner", async (active) => {
    started(); await wait; active(); f.calls.push("server-register"); return true;
  });
  const rejected = assert.rejects(sync, PushRegistrationCancelled);
  await ready;
  await f.controller.prepareAccountDeletion("owner");
  const finish = f.controller.finishAccountDeletion();
  release();
  await Promise.all([rejected, finish]);
  assert.ok(!f.calls.includes("server-register"));
  assert.ok(!f.calls.some((call) => call.startsWith("server:")));
  assert.equal(f.state.status, "disabled");
});

test("Android 신규 등록은 자동 초기화를 켜는 기존 플러그인을 우회하고 FCM·FID 삭제를 기다린다", () => {
  const java = readFileSync("android/app/src/main/java/com/noonmaru/tuti/TutiPushPrivacyPlugin.java", "utf8");
  const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
  assert.match(manifest, /firebase_messaging_auto_init_enabled" android:value="false"/);
  assert.match(manifest, /firebase_analytics_collection_enabled" android:value="false"/);
  assert.doesNotMatch(java, /setAutoInitEnabled\(true\)/);
  assert.match(java, /Tasks.await\(FirebaseMessaging.getInstance\(\).deleteToken\(\)\)/);
  assert.match(java, /Tasks.await\(FirebaseInstallations.getInstance\(\).delete\(\)\)/);
  assert.match(java, /newSingleThreadExecutor/);
});
