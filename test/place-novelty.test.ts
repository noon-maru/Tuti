import assert from "node:assert/strict";
import test from "node:test";
import { noveltyBoost, rankWithNovelty, loadPlaceNoveltySignals } from "@/server/recommendations/novelty";
import { selectDiverseRecommendations } from "@/server/recommendations/finalDiversity";
import type { TutiPlace } from "@/lib/recommendations";
import type { prisma } from "@/server/db/prisma";

const place = (id: string, score = 30): TutiPlace => ({ id, name: id, phrase: "", note: "", image: "", travelTime: "", crowd: "", today: "", fatigue: score, rankingScore: score, fatigueScore: score, movementLevel: "near", moodTags: [], experienceType: "forest_garden" });

test("새 장소·덜 본 장소에만 0~6 가점을 주며 익숙한 장소에 음수 가점을 주지 않는다", () => {
  assert.equal(noveltyBoost(), 6);
  assert.equal(noveltyBoost({ exposures: 1, recorded: false, familiar: false }), 4);
  assert.equal(noveltyBoost({ exposures: 2, recorded: false, familiar: false }), 2);
  assert.equal(noveltyBoost({ exposures: 4, recorded: false, familiar: false }), 0);
  assert.equal(noveltyBoost({ exposures: 0, recorded: true, familiar: false }), 0);
  assert.equal(noveltyBoost({ exposures: 0, recorded: false, familiar: true }), 0);
});

test("가점은 비슷한 후보 순서만 바꾸고 기존 점수·후보 수·원본은 보존한다", () => {
  const original = [place("known"), place("new", 32)];
  const ranked = rankWithNovelty(original, [{ placeId: "known", exposures: 0, recorded: false, familiar: true }]);
  assert.deepEqual(ranked.map(row => row.id), ["new", "known"]);
  assert.equal(ranked.find(row => row.id === "known")?.rankingScore, 30);
  assert.equal(ranked.find(row => row.id === "known")?.fatigueScore, 30);
  assert.equal(ranked[0].rankingScore, 32);
  assert.ok(original.every(row => row.noveltyBoost === undefined));
});

test("모두 익숙하거나 한 곳뿐이어도 추천에서 빠지지 않는다", () => {
  const places = Array.from({ length: 4 }, (_, i) => place(String(i)));
  const ranked = rankWithNovelty(places, places.map(row => ({ placeId: row.id, exposures: 8, recorded: false, familiar: true })));
  assert.equal(selectDiverseRecommendations(ranked, 6).length, 4);
  assert.equal(selectDiverseRecommendations(rankWithNovelty([place("only")], [{ placeId: "only", exposures: 0, recorded: false, familiar: true }]), 6)[0].id, "only");
});

test("새로움이 기본 품질 범위를 벗어난 장소를 강제로 끌어올리지 않는다", () => {
  const good = Array.from({ length: 6 }, (_, i) => place(`good-${i}`, 10));
  const ranked = rankWithNovelty([...good, place("distant", 50)], good.map(row => ({ placeId: row.id, exposures: 0, recorded: true, familiar: false })));
  assert.ok(!selectDiverseRecommendations(ranked).some(row => row.id === "distant"));
});

test("이력 조회는 사용자·후보에 한정한 단일 쿼리이며 실패 시 원래 추천으로 복귀한다", async () => {
  let transactions = 0, reads = 0;
  const bindings: unknown[] = [];
  const tx = {
    $executeRawUnsafe: async (sql: string) => { assert.ok(sql.includes("100ms")); return 0; },
    $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => { reads++; bindings.push(...values); return []; },
  };
  const database = { $transaction: async (fn: (value: typeof tx) => unknown) => { transactions++; return fn(tx); } } as unknown as typeof prisma;
  const now = new Date("2026-11-13T00:00:00Z");
  assert.equal(await loadPlaceNoveltySignals(undefined, ["a"], now, database), null);
  assert.deepEqual(await loadPlaceNoveltySignals("owner-a", ["a", "a"], now, database), []);
  assert.equal(transactions, 1); assert.equal(reads, 1);
  assert.ok(bindings.includes("owner-a"));
  assert.ok(bindings.some(value => Array.isArray(value) && value.length === 1 && value[0] === "a"));
  const failing = { $transaction: async () => { throw new Error("timeout"); } } as unknown as typeof prisma;
  assert.equal(await loadPlaceNoveltySignals("owner-a", ["a"], now, failing), null);
  const places = [place("a")]; assert.deepEqual(rankWithNovelty(places, null), places);
});
