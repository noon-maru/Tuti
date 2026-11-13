import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePlaceFamiliarity } from "@/shared/api/placeFamiliarity";
import { readPlaceFamiliarity, setPlaceFamiliarity } from "@/server/recommendations/familiarity";
import type { prisma } from "@/server/db/prisma";

test("익숙함 입력은 장소 ID와 실제 boolean만 허용한다", () => {
  assert.deepEqual(parsePlaceFamiliarity({ placeId: "tourapi-123", familiar: true }), { placeId: "tourapi-123", familiar: true });
  for (const body of [null, [], { placeId: "../other", familiar: true }, { placeId: "a", familiar: "true" }, { familiar: true }]) assert.equal(parsePlaceFamiliarity(body), null);
});

test("표시·취소는 현재 사용자와 장소에만 적용하고 중복 표시를 upsert한다", async () => {
  const written: unknown[] = [], deleted: unknown[] = [];
  const tx = { place: { findFirst: async () => ({ id: "a" }) }, placeFamiliarity: {
    upsert: async (data: unknown) => { written.push(data); }, deleteMany: async (data: unknown) => { deleted.push(data); },
  } };
  const database = { $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as unknown as typeof prisma;
  const now = new Date("2026-11-13T00:00:00Z");
  assert.deepEqual(await setPlaceFamiliarity("user-a", "a", true, now, database), { placeId: "a", familiar: true });
  const data = written[0] as { where: unknown; create: { expiresAt: Date } };
  assert.deepEqual(data.where, { userId_placeId: { userId: "user-a", placeId: "a" } });
  assert.equal(data.create.expiresAt.getTime() - now.getTime(), 180 * 86400_000);
  await setPlaceFamiliarity("user-b", "a", false, now, database);
  assert.deepEqual(deleted, [{ where: { userId: "user-b", placeId: "a" } }]);
});

test("만료 경계부터 익숙함 가점을 제한하지 않고 API는 계정별 비공개 응답이다", async () => {
  const now = new Date("2026-11-13T00:00:00Z");
  const database = { placeFamiliarity: { findUnique: async ({ where }: { where: unknown }) => {
    assert.deepEqual(where, { userId_placeId: { userId: "me", placeId: "a" } }); return { expiresAt: now };
  } } } as unknown as typeof prisma;
  assert.deepEqual(await readPlaceFamiliarity("me", "a", now, database), { placeId: "a", familiar: false });
  const route = readFileSync("src/app/api/place-familiarity/route.ts", "utf8");
  assert.ok(route.includes("guardServiceTerms(request)"));
  assert.ok(route.includes("authenticateUser(request)"));
  assert.ok(route.includes('"private, no-store"'));
});

test("익숙함 표시는 현재 카드 삭제·재정렬·추천 강제 갱신을 실행하지 않는다", () => {
  const hook = readFileSync("src/features/tuti/hooks/usePlaceFamiliarity.ts", "utf8");
  assert.ok(hook.includes('["place-familiarity", owner, placeId]'));
  assert.ok(hook.includes("getSessionSnapshot()?.userId !== owner"));
  assert.ok(hook.includes("lock.current = true"));
  assert.ok(!hook.includes("refreshDailyRecommendation("));
  assert.ok(!hook.includes("invalidateQueries("));
});

function feedbackHarness() {
  const source = readFileSync("src/features/tuti/hooks/usePlaceFamiliarity.ts", "utf8");
  const match = source.match(/async function toggle\(\) \{[\s\S]*?\n  \}/);
  assert.ok(match);
  const lock = { current: false }, writes: unknown[] = [], notices: string[] = [];
  let currentOwner = "a", calls = 0, resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const save = async (owner: string, placeId: string, familiar: boolean) => {
    calls++; assert.equal(owner, "a"); assert.equal(placeId, "p"); assert.equal(familiar, true);
    return new Promise((done, fail) => { resolve = done; reject = fail; });
  };
  const bindings = { lock, query: { isSuccess: true, data: { familiar: false } }, owner: "a", placeId: "p", key: ["place-familiarity", "a", "p"],
    setPending() {}, savePlaceFamiliarity: save, getSessionSnapshot: () => ({ userId: currentOwner }),
    client: { setQueryData: (...args: unknown[]) => writes.push(args) },
    showToast: (value: string) => notices.push(value), showErrorToast: (value: string) => notices.push(value),
  };
  const toggle = new Function(...Object.keys(bindings), `return (${match[0]});`)(...Object.values(bindings)) as () => Promise<void>;
  return { toggle, writes, notices, calls: () => calls, switchOwner: () => { currentOwner = "b"; }, resolve: () => resolve({ placeId: "p", familiar: true }), reject: () => reject(new Error("offline")) };
}

test("표시 연속 클릭은 한 번만 저장하고 서버 확인 뒤에만 성공을 알린다", async () => {
  const h = feedbackHarness(), first = h.toggle();
  await h.toggle(); assert.equal(h.calls(), 1); assert.equal(h.writes.length, 0);
  h.resolve(); await first;
  assert.equal(h.writes.length, 1); assert.equal(h.notices.length, 1);
});

test("표시 실패나 계정 전환 뒤 응답은 다른 계정 캐시나 성공 안내를 만들지 않는다", async () => {
  const failed = feedbackHarness(), pending = failed.toggle(); failed.reject(); await pending;
  assert.equal(failed.writes.length, 0); assert.ok(failed.notices[0].includes("저장하지 못했어요"));
  const changed = feedbackHarness(), stale = changed.toggle(); changed.switchOwner(); changed.resolve(); await stale;
  assert.deepEqual(changed.writes, []); assert.deepEqual(changed.notices, []);
});
