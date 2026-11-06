import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { createJSONStorage } from "zustand/middleware";
import { useTutiStore } from "@/store/tuti";
import { getLocationTermsVersion } from "@/shared/location/terms";
import { needsRecommendationRegionChoice, shouldRestoreDeviceLocation } from "@/features/tuti/location/prepareRecommendationLocation";

const source = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
const original = { userId: "control-a", accessToken: "a" }, replacement = { userId: "control-b", accessToken: "b" };
const accepted = { status: "accepted" as const, termsVersion: getLocationTermsVersion(), updatedAt: "2026-11-06T00:00:00.000Z" };
function harness(name: string, update: (...args: unknown[]) => Promise<unknown>) {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })) });
  useTutiStore.getState().resetAllData();
  useTutiStore.setState({ locationConsent: accepted });
  useTutiStore.getState().setUserLocation({ latitude: 37, longitude: 127 });
  const generation = { current: 0 }, ui: unknown[] = [], owner = { current: original };
  const bindings = {
    getSessionSnapshot: () => owner.current,
    isSessionCurrent: (value: typeof original) => value.accessToken === owner.current.accessToken,
    consentSyncGeneration: generation, deviceRequestGeneration: { current: 0 },
    clearUserLocation: useTutiStore.getState().clearUserLocation, syncLocationConsent: useTutiStore.getState().syncLocationConsent,
    clearLocationQueries() {}, finishRequest() {}, setRequesting: (value: boolean) => ui.push(["requesting", value]),
    setConsentSheetOpen: (value: boolean) => ui.push(["consent", value]),
    setRegionSheetDismissible: (value: boolean) => ui.push(["dismissible", value]), setRegionSheetOpen: (value: boolean) => ui.push(["region", value]),
    updateLocationConsent: update, getLocationTermsVersion, preferencesStorage: { flush: async () => {} },
  };
  const match = source.match(new RegExp(`const ${name} = useCallback\\((async \\(\\) => \\{[\\s\\S]*?)\\n  \\}, \\[[^\\]]*\\]\\);`));
  assert.ok(match);
  const compiled = ts.transpileModule(`const run=${match[1]}\n};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function(...Object.keys(bindings), `${compiled};return run;`)(...Object.values(bindings)) as () => Promise<void>;
  return { run, generation, ui, owner };
}

for (const [name, status] of [["pauseLocation", "paused"], ["withdrawLocation", "withdrawn"]] as const) {
  test(`${status}: 서버 실패를 완료로 표시하지 않고 현재 위치 자동 복원도 멈춘다`, async () => {
    const { run } = harness(name, async () => { throw new Error("synthetic failure"); });
    await assert.rejects(run(), /synthetic failure/);
    const state = useTutiStore.getState();
    assert.equal(state.locationConsent?.status, "accepted", "확인된 서버 상태를 임의 변경하지 않는다");
    assert.equal(state.userLocation, undefined);
    assert.equal(shouldRestoreDeviceLocation(state), false);
    assert.equal(needsRecommendationRegionChoice(state), true);
  });
  test(`${status}: 계정 전환·새 설정 이후 도착한 응답은 현재 상태와 UI를 건드리지 않는다`, async () => {
    let complete!: (value: unknown) => void;
    const h = harness(name, async (...args) => { assert.equal(args[3], original.userId); return new Promise(resolve => { complete = resolve; }); });
    const pending = h.run();
    h.owner.current = replacement; h.generation.current++;
    const before = [...h.ui];
    complete({ consent: { ...accepted, status } });
    await assert.rejects(pending, /변경/);
    assert.deepEqual(h.ui, before);
    assert.equal(useTutiStore.getState().locationConsent?.status, "accepted");
  });
  test(`${status}: 확인된 서버 응답의 시각을 그대로 반영한다`, async () => {
    const saved = { ...accepted, status, updatedAt: "2026-11-06T01:00:00.000Z" };
    const { run } = harness(name, async () => ({ consent: saved }));
    await run();
    assert.equal(useTutiStore.getState().locationConsent?.status, status);
    assert.equal(useTutiStore.getState().locationConsent?.updatedAt, saved.updatedAt);
  });
}
