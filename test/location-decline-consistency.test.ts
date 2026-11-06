import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("위치 거절은 실패를 완료로 바꾸지 않고 중복 제출·다음 계정 응답을 차단한다", async () => {
  const source = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
  const match = source.match(/const declineRequest = useCallback\((\(\) => \{[\s\S]*?)\n  \}, \[[^\]]*\]\);/)!;
  const compiled = ts.transpileModule(`const run=${match[1]}\n};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const original = { userId: "decline-a", accessToken: "a" }, owner = { current: original };
  const generation = { current: 0 }, lock = { current: null as number | null }, states: unknown[] = [];
  let posts = 0, reject!: (cause: Error) => void, complete!: (value: unknown) => void;
  const bindings = {
    declineWriteRef: lock, getSessionSnapshot: () => owner.current, isSessionCurrent: (value: typeof original) => value.accessToken === owner.current.accessToken,
    consentSyncGeneration: generation, deviceRequestGeneration: { current: 0 }, getLocationTermsVersion: () => "2026-10-22",
    clearUserLocation: (source: string) => { assert.equal(source, "region"); }, clearLocationQueries() {},
    setRequesting: (value: unknown) => states.push(["requesting", value]), setConsentError: (value: unknown) => states.push(["error", value]),
    syncLocationConsent: (value: unknown) => states.push(["confirmed", value]), setConsentSheetOpen: (value: unknown) => states.push(["consent", value]),
    pendingLocationResultRef: { current: null }, setRegionSheetDismissible() {}, setRegionSheetOpen: (value: unknown) => states.push(["region", value]),
    updateLocationConsent: async (...args: unknown[]) => {
      assert.equal(args[3], owner.current.userId); posts++;
      return new Promise((resolve, fail) => { complete = resolve; reject = fail; });
    },
  };
  const run = new Function(...Object.keys(bindings), `${compiled};return run;`)(...Object.values(bindings));
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  run(); run(); assert.equal(posts, 1);
  reject(new Error("synthetic network failure")); await flush();
  assert.ok(states.some(value => JSON.stringify(value).includes("synthetic network failure")));
  assert.equal(states.some(value => JSON.stringify(value).includes("confirmed")), false);
  assert.equal(states.some(value => JSON.stringify(value) === '["region",true]'), false);
  assert.equal(lock.current, null);
  states.length = 0;
  run(); const saved = { status: "declined", termsVersion: "2026-10-22", updatedAt: "server-time" };
  complete({ consent: saved }); await flush();
  assert.ok(states.some(value => JSON.stringify(value) === JSON.stringify(["confirmed", saved])));
  assert.ok(states.some(value => JSON.stringify(value) === '["region",true]'));
  states.length = 0;
  run(); owner.current = { userId: "decline-b", accessToken: "b" }; generation.current++;
  const before = [...states]; complete({ consent: saved }); await flush();
  assert.deepEqual(states, before);
});
