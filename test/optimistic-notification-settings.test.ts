import assert from "node:assert/strict";
import test from "node:test";
import type { QueryClient } from "@tanstack/react-query";
import { notificationSettingsKey, notificationSettingsMutation, type NotificationSettingsChange } from "../src/lib/optimisticNotificationSettings.ts";

const original = { newsEnabled: false, reminderEnabled: false, reminderTime: "19:00", timeZone: "Asia/Seoul" };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
function fixture() {
  let owner = "owner-a", disabled = 0, saves = 0;
  const cache = new Map<string, typeof original>([[JSON.stringify(notificationSettingsKey(owner)), original]]);
  const client = {
    async cancelQueries() {},
    getQueryData: (key: unknown) => cache.get(JSON.stringify(key)),
    setQueryData: (key: unknown, value: typeof original) => cache.set(JSON.stringify(key), value),
  } as unknown as QueryClient;
  const services = {
    currentOwner: () => owner,
    enable: async (): Promise<{ status: string }> => ({ status: "registered" }),
    save: async (value: typeof original) => { saves++; return value; },
    disable: async () => { disabled++; }, cancelLegacy: async () => {},
  };
  const input: NotificationSettingsChange = { owner, next: { ...original, newsEnabled: true }, enableDevice: true, wasEnabled: false };
  return { client, services, input, owner: (value: string) => { owner = value; },
    value: () => client.getQueryData(notificationSettingsKey("owner-a")), disabled: () => disabled, saves: () => saves };
}

test("서버 응답 전 스위치를 즉시 표시하고 실제 저장 성공 후 확정한다", async () => {
  const f = fixture(), pending = deferred<typeof original>();
  f.services.save = () => pending.promise;
  const operations = notificationSettingsMutation(f.client, f.services);
  await operations.onMutate(f.input);
  const saving = operations.mutationFn(f.input);
  assert.equal(f.value()?.newsEnabled, true);
  pending.resolve(f.input.next);
  operations.onSuccess(await saving, f.input);
  assert.equal(f.value()?.newsEnabled, true);
});

test("권한 거절은 실제 저장을 하지 않고 이전 표시로 복원한다", async () => {
  const f = fixture(); f.services.enable = async () => ({ status: "denied" });
  const operations = notificationSettingsMutation(f.client, f.services);
  const context = await operations.onMutate(f.input);
  await assert.rejects(operations.mutationFn(f.input), /허용/);
  operations.onError(new Error(), f.input, context);
  assert.deepEqual(f.value(), original); assert.equal(f.saves(), 0);
});

test("저장 실패 시 이전 설정을 복원하고 새로 만든 기기 등록만 정리한다", async () => {
  for (const wasEnabled of [false, true]) {
    const f = fixture(); f.input.wasEnabled = wasEnabled;
    f.services.save = async () => { throw Error("offline"); };
    const operations = notificationSettingsMutation(f.client, f.services);
    const context = await operations.onMutate(f.input);
    await assert.rejects(operations.mutationFn(f.input), /offline/);
    operations.onError(new Error(), f.input, context);
    assert.deepEqual(f.value(), original); assert.equal(f.disabled(), wasEnabled ? 0 : 1);
  }
});

test("서버 저장 뒤 기기 정리만 실패해도 성공한 서버 설정은 되돌리지 않는다", async () => {
  const f = fixture(); f.services.cancelLegacy = async () => { throw Error("native cleanup"); };
  const operations = notificationSettingsMutation(f.client, f.services);
  await operations.onMutate(f.input);
  const result = await operations.mutationFn(f.input);
  operations.onSuccess(result, f.input);
  assert.equal(result.cleanupPending, true); assert.equal(f.value()?.newsEnabled, true);
});

test("권한 요청 중 계정 전환 시 이전 설정을 새 계정으로 저장하지 않는다", async () => {
  const f = fixture(); f.services.enable = async () => { f.owner("owner-b"); return { status: "registered" }; };
  const operations = notificationSettingsMutation(f.client, f.services);
  await operations.onMutate(f.input);
  await assert.rejects(operations.mutationFn(f.input), /계정/);
  assert.equal(f.saves(), 0); assert.equal(f.disabled(), 0);
});

test("계정 전환 후 도착한 저장 응답은 캐시에 다시 넣지 않는다", async () => {
  const f = fixture();
  const operations = notificationSettingsMutation(f.client, f.services);
  const context = await operations.onMutate(f.input);
  f.owner("owner-b");
  f.client.setQueryData = () => { throw Error("must not write old account cache"); };
  operations.onSuccess({ settings: original }, f.input);
  operations.onError(new Error(), f.input, context);
});
