import assert from "node:assert/strict";
import test from "node:test";
import { createTermsAcceptanceCache } from "../src/lib/serviceTermsAcceptanceCache";
import documents from "../src/shared/legal/finalizedDocuments.json";

test("기기 동의 캐시는 계정별로 분리하고 토큰·원문 없이 버전과 해시만 저장한다", async () => {
  const values = new Map<string, string>();
  const cache = createTermsAcceptanceCache({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
  const finalized = documents["service-terms"];
  const receipt = { userId: "account-a", version: finalized.version, documentHash: finalized.documentHash };
  assert.equal(await cache.read(receipt.userId), null);
  await cache.write(receipt);
  assert.deepEqual(await cache.read(receipt.userId), receipt);
  assert.equal(await cache.read("account-b"), null);
  assert.deepEqual(Object.keys(JSON.parse([...values.values()][0])).sort(), ["documentHash", "schema", "userId", "version"]);
  await cache.clear("account-a");
  assert.equal(await cache.read("account-a"), null);
});

test("손상·계정 불일치·확정 원문 해시 불일치 캐시는 사용하지 않는다", async () => {
  let raw: string | null = "not json";
  const cache = createTermsAcceptanceCache({ getItem: () => raw, setItem: () => {}, removeItem: () => {} });
  assert.equal(await cache.read("a"), null);
  raw = JSON.stringify({ schema: 1, userId: "b", version: "old", documentHash: "a".repeat(64) });
  assert.equal(await cache.read("a"), null);
  raw = JSON.stringify({ schema: 1, userId: "a", version: documents["service-terms"].version, documentHash: "a".repeat(64) });
  assert.equal(await cache.read("a"), null);
});

test("선택적인 UX 캐시 저장소 장애는 실제 동의나 인증 저장소로 전파하지 않는다", async () => {
  const fail = () => { throw new Error("storage unavailable"); };
  const cache = createTermsAcceptanceCache({ getItem: fail, setItem: fail, removeItem: fail });
  assert.equal(await cache.read("a"), null);
  await cache.write({ userId: "a", version: "test", documentHash: "a".repeat(64) });
  await cache.clear("a");
});

test("늦게 끝난 캐시 쓰기가 이미 확인된 무효화를 취소하지 않는다", async () => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let raw: string | null = null;
  const cache = createTermsAcceptanceCache({ getItem: () => raw,
    setItem: async (_key, value) => { await waiting; raw = value; },
    removeItem: () => { raw = null; } });
  const write = cache.write({ userId: "a", version: "test", documentHash: "a".repeat(64) });
  await cache.clear("a");
  release(); await write;
  assert.equal(await cache.read("a"), null);
});
