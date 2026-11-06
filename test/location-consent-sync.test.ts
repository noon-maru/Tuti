import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createJSONStorage } from "zustand/middleware";
import { useTutiStore } from "@/store/tuti";
import { getLocationTermsVersion } from "@/shared/location/terms";

const source = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
function callback(name: string, bindings: Record<string, unknown>) {
  const match = source.match(new RegExp(`const ${name} = useCallback\\(((?:async )?\\(\\) => \\{[\\s\\S]*?)\\n  \\}, \\[[^\\]]*\\]\\);`));
  assert.ok(match, name);
  const compiled = ts.transpileModule(`const run = ${match[1]}\n};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}; return run;`)(...Object.values(bindings));
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const saved = { status: "accepted" as const, ageConfirmed: true, termsVersion: getLocationTermsVersion(), updatedAt: "2026-11-06T00:00:00.000Z" };

test("동의 저장 응답을 그대로 보관해 포커스 재동기화가 좌표를 지우지 않는다", async () => {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} })) });
  useTutiStore.setState({ locationConsent: undefined, userLocation: undefined });
  const consentSyncGeneration = { current: 0 }, errors: unknown[] = [];
  const syncLocationConsent = useTutiStore.getState().syncLocationConsent;
  const agree = callback("agreeAndRequest", {
    consentSyncGeneration, setConsentError: (error: unknown) => errors.push(error), setRequesting() {},
    updateLocationConsent: async () => ({ consent: saved }), getLocationTermsVersion, syncLocationConsent,
    resolveDeviceLocation: async () => {
      useTutiStore.getState().setUserLocation({ latitude: 37, longitude: 127 });
      useTutiStore.getState().setLocationPermissionStatus("granted");
    },
  });
  agree(); await flush();
  assert.equal(useTutiStore.getState().locationConsent?.updatedAt, saved.updatedAt);
  const refresh = callback("refreshLocationConsent", { consentSyncGeneration, requestPromiseRef: { current: null }, fetchLocationConsent: async () => saved, syncLocationConsent });
  await refresh();
  assert.ok(useTutiStore.getState().userLocation);
  assert.equal(useTutiStore.getState().locationPermissionStatus, "granted");
  assert.deepEqual(errors, [null]);
  assert.doesNotMatch(source, /acceptLocationConsent\(/);
});

test("화면 복귀 조회는 진행 중인 위치 요청의 세대를 무효화하지 않는다", async () => {
  const generation = { current: 4 };
  let fetches = 0, applied = 0;
  const request = { current: Promise.resolve() as Promise<void> | null };
  const refresh = callback("refreshLocationConsent", {
    consentSyncGeneration: generation, requestPromiseRef: request,
    fetchLocationConsent: async () => { fetches++; return saved; }, syncLocationConsent() { applied++; },
  });
  await refresh();
  assert.equal(generation.current, 4); assert.equal(fetches, 0); assert.equal(applied, 0);
  request.current = null;
  await refresh();
  assert.equal(fetches, 1); assert.equal(applied, 1);
});

test("동의 저장 대기 중 철회·계정 전환이 발생하면 늦은 응답으로 위치를 수집하지 않는다", async () => {
  const generation = { current: 0 };
  let complete!: (response: unknown) => void, reads = 0, synced = 0;
  const agree = callback("agreeAndRequest", {
    consentSyncGeneration: generation, setConsentError() {}, setRequesting() {}, getLocationTermsVersion,
    updateLocationConsent: () => new Promise(resolve => { complete = resolve; }),
    syncLocationConsent() { synced++; }, resolveDeviceLocation() { reads++; },
  });
  agree(); generation.current++;
  complete({ consent: saved }); await flush();
  assert.equal(reads, 0); assert.equal(synced, 0);
});
