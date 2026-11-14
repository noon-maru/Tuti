import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { applyDemo, demoRecords, inspectDemo, validateDemoFixture, verifyDemo, type DemoFixture } from "../scripts/seed-demo-harumadis";
import type { prisma } from "../src/server/db/prisma";

const fixture = JSON.parse(readFileSync("data/demo-harumadis/2026-11-14.json", "utf8")) as DemoFixture;
const userId = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, unknown> & { id: string };
function harness() {
  let state: { books: Row[]; entries: Row[]; links: Row[]; logs: Row[]; jobs: Row[] } = { books: [], entries: [], links: [], logs: [], jobs: [] };
  let missingUser = false, badPhoto = false, failLink = 0, uploads = 0, verifies = 0, cleanup = 0;
  const publicPlaces = fixture.photos.map(p => ({ id: p.placeId, name: p.name, image: p.url, sourceCopyright: p.copyright }));
  const source = {
    $queryRaw: async () => [{ id: userId }],
    user: { findMany: async ({ where }: { where: Record<string, unknown> }) => {
      assert.equal(where.displayName, "정연한"); assert.deepEqual(where.authIdentities, { some: { provider: "kakao" } });
      if (where.id) assert.equal(where.id, userId);
      return missingUser ? [] : [{ id: userId, displayName: "정연한", role: "user" }];
    } },
    place: { findMany: async () => badPhoto ? publicPlaces.slice(1) : structuredClone(publicPlaces) },
    harumadi: {
      findMany: async () => state.books,
      count: async () => 2 + state.books.length,
      create: async ({ data }: { data: Row }) => { state.books.push({ ...data, collaborationStartedAt: null }); return data; },
    },
    journalEntry: {
      findMany: async ({ where }: { where: { image?: unknown } }) => where.image ? state.entries.filter(e => e.image) : state.entries,
      count: async () => 4 + state.entries.length,
      create: async ({ data }: { data: Row }) => { state.entries.push({ ...data, publicId: null, publishedAt: null }); return data; },
    },
    harumadiEntryLink: {
      findMany: async () => state.links,
      create: async ({ data }: { data: Row }) => { if (failLink && state.links.length === failLink) throw new Error("FIXTURE_WRITE_FAILED"); state.links.push(data); return data; },
    },
    systemLog: {
      findUnique: async () => state.logs[0] ?? null,
      create: async ({ data }: { data: Row }) => { state.logs.push(data); return data; },
    },
    userDataCleanupJob: {
      create: async ({ data }: { data: Row }) => { state.jobs.push({ ...data, attempts: 0, leaseToken: null }); return data; },
      deleteMany: async ({ where }: { where: { id: string } }) => { const count = state.jobs.filter(j => j.id === where.id).length; state.jobs = state.jobs.filter(j => j.id !== where.id); return { count }; },
      updateMany: async () => ({ count: state.jobs.length }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(state);
      try { return await fn(source); } catch (error) { state = before; throw error; }
    },
  };
  const db = source as unknown as typeof prisma;
  const storage = {
    prepare: async () => ({ bytes: Buffer.from("fixture"), width: 940, height: 626 }),
    put: async (key: string) => { assert.ok(state.jobs.length, "업로드 전 정리 예약이 필요하다"); assert.ok(key.startsWith(`journal-images/${userId}/`)); uploads++; },
    verify: async () => { verifies++; },
    clean: async () => { cleanup++; assert.equal(state.entries.length, 0, "롤백 이후 고아 후보만 정리한다"); state.jobs = []; },
  };
  return { db, storage, state: () => state, counters: () => ({ uploads, verifies, cleanup }), noUser: () => { missingUser = true; }, badPhoto: () => { badPhoto = true; }, failLink: () => { failLink = 4; } };
}

test("시연 자료는 5권·15마디·사진 11개와 네 표지를 구성하고 시연·출처를 표시한다", () => {
  validateDemoFixture(fixture);
  const records = demoRecords(fixture, userId);
  assert.equal(records.books.length, 5); assert.equal(records.entries.length, 15);
  assert.equal(records.entries.filter(e => e.photo).length, 11);
  assert.equal(new Set(records.books.map(b => b.coverStyle)).size, 4);
  assert.equal(new Set([...records.books, ...records.entries].map(row => row.id)).size, 20);
  assert.ok(records.books.every(b => b.backCoverText.includes("시연용")));
  assert.ok(records.entries.filter(e => e.photo).every(e => e.content.includes("한국관광공사 TourAPI") && e.content.includes("https://api.visitkorea.or.kr")));
  assert.deepEqual(records.entries.map(e => e.id), demoRecords(fixture, userId).entries.map(e => e.id));
  assert.notEqual(records.books[0].id, demoRecords(fixture, "other").books[0].id);
});

test("타 사이트·변경 금지 사진·변조된 대상 규모는 거절한다", () => {
  for (const edit of [(d: DemoFixture) => { d.photos[0].url = "https://example.com/photo.jpg"; },
    (d: DemoFixture) => { d.photos[0].copyright = "Type3"; }, (d: DemoFixture) => { d.books.pop(); }]) {
    const changed = structuredClone(fixture); edit(changed); assert.throws(() => validateDemoFixture(changed));
  }
});

test("사전 확인은 카카오·표시 이름을 한정하고 DB·객체를 변경하지 않는다", async () => {
  const h = harness(), plan = await inspectDemo(fixture, userId, h.db);
  assert.equal(plan.existingBooks, 2); assert.equal(plan.existingEntries, 4);
  assert.equal(plan.alreadyPresent, false); assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(h.counters(), { uploads: 0, verifies: 0, cleanup: 0 });
  assert.ok(Object.values(h.state()).every(rows => rows.length === 0));
  h.noUser(); await assert.rejects(inspectDemo(fixture, userId, h.db), /TARGET_KAKAO_ACCOUNT_NOT_UNIQUE/);
});

test("다른 계획 해시나 원본 사진의 권리 상태 변경은 쓰기 전에 중단한다", async () => {
  const h = harness(); await assert.rejects(applyDemo(fixture, userId, "0".repeat(64), h.db, h.storage), /DEMO_PLAN_CHANGED/);
  assert.equal(h.counters().uploads, 0);
  h.badPhoto(); await assert.rejects(inspectDemo(fixture, userId, h.db), /PUBLIC_PHOTO_SOURCE_CHANGED/);
});

test("5권·15마디·연결은 한 번에 추가하고 외부 사진 대신 본인 저장소 사본을 참조한다", async () => {
  const h = harness(), plan = await inspectDemo(fixture, userId, h.db);
  const result = await applyDemo(fixture, userId, plan.planHash, h.db, h.storage);
  assert.equal(result.mode, "applied"); assert.equal(h.state().books.length, 5); assert.equal(h.state().entries.length, 15);
  assert.equal(h.state().links.length, 15); assert.equal(h.state().logs.length, 1); assert.equal(h.state().jobs.length, 0);
  assert.ok(h.state().entries.every(e => e.publicationStatus === "private" && e.sensitiveContent === false && e.ownerId === userId));
  assert.ok(h.state().books.every(b => b.ownerId === userId && !b.collaborationStartedAt));
  assert.ok(h.state().entries.filter(e => e.image).every(e => String(e.image).startsWith(`journal-images/${userId}/${e.id}/`)));
  const verified = await verifyDemo(fixture, userId, h.db, h.storage); assert.equal(verified.imagesReadBack, 11);
  const again = await applyDemo(fixture, userId, plan.planHash, h.db, h.storage);
  assert.equal(again.mode, "already-present"); assert.equal(h.counters().uploads, 11);
  assert.equal(h.state().entries.length, 15); assert.equal(h.state().logs.length, 1);
});

test("도중 DB 오류는 전체 입력과 영수증을 롤백하고 새 이미지 회수 예약을 남긴다", async () => {
  const h = harness(), plan = await inspectDemo(fixture, userId, h.db); h.failLink();
  await assert.rejects(applyDemo(fixture, userId, plan.planHash, h.db, h.storage), /FIXTURE_WRITE_FAILED/);
  assert.equal(h.state().books.length, 0); assert.equal(h.state().entries.length, 0);
  assert.equal(h.state().links.length, 0); assert.equal(h.state().logs.length, 0); assert.equal(h.counters().cleanup, 1);
});

test("사진 준비 실패는 DB를 건드리지 않고 업로드 실패는 회수 예약으로 정리한다", async () => {
  const failedPrepare = harness(), firstPlan = await inspectDemo(fixture, userId, failedPrepare.db);
  await assert.rejects(applyDemo(fixture, userId, firstPlan.planHash, failedPrepare.db,
    { ...failedPrepare.storage, prepare: async () => { throw new Error("FIXTURE_PREPARE_FAILED"); } }), /FIXTURE_PREPARE_FAILED/);
  assert.ok(Object.values(failedPrepare.state()).every(rows => rows.length === 0));
  const failedUpload = harness(), secondPlan = await inspectDemo(fixture, userId, failedUpload.db);
  await assert.rejects(applyDemo(fixture, userId, secondPlan.planHash, failedUpload.db,
    { ...failedUpload.storage, put: async () => { throw new Error("FIXTURE_UPLOAD_FAILED"); } }), /FIXTURE_UPLOAD_FAILED/);
  assert.equal(failedUpload.counters().cleanup, 1); assert.equal(failedUpload.state().entries.length, 0);
});

test("적용 후 일부를 지웠거나 공개로 변경하면 덮어쓰거나 재생성하지 않는다", async () => {
  const h = harness(), plan = await inspectDemo(fixture, userId, h.db);
  await applyDemo(fixture, userId, plan.planHash, h.db, h.storage);
  h.state().entries[0].publicationStatus = "published";
  await assert.rejects(applyDemo(fixture, userId, plan.planHash, h.db, h.storage), /DEMO_PARTIAL_OR_CHANGED/);
  assert.equal(h.counters().uploads, 11);
  h.state().entries = [];
  await assert.rejects(inspectDemo(fixture, userId, h.db), /DEMO_PARTIAL_OR_CHANGED/);
});

test("실행 경계는 읽기 기본·커밋 사본·정확한 새 정리 예약만 사용하고 분석 사건은 만들지 않는다", () => {
  const script = readFileSync("scripts/seed-demo-harumadis.ts", "utf8"), shell = readFileSync("scripts/ops/tuti-demo-harumadis", "utf8");
  assert.match(script, /EXPLICIT_TARGET_AND_PLAN_REQUIRED/); assert.match(script, /attempts: 0, leaseToken: null, nextAttemptAt: \{ gt:/);
  assert.doesNotMatch(script, /recordLifecycle\(|recordContribution\(|recommendationAction\.create|journalEntry\.update|harumadi\.update|journalEntry\.delete|harumadi\.delete/);
  assert.match(shell, /maintenance\.lock/); assert.match(shell, /restore-privacy\/pending.env/);
  assert.match(shell, /diff --quiet HEAD/); assert.match(shell, /install -m 0644/); assert.match(shell, /--user 1000:1000/);
  assert.doesNotMatch(shell, /--remove-orphans|docker compose.*build|docker exec|\.env.*cat/);
});

test("조회·적용 혼용과 대상·해시 없는 적용은 CLI가 DB 접근 전에 거절한다", () => {
  for (const args of [["--check", "--apply"], ["--apply"]]) {
    const result = spawnSync(process.execPath, ["--import", "./test/setup-env.mjs", "--import", "tsx", "scripts/seed-demo-harumadis.ts", ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /INVALID_ARGUMENTS|EXPLICIT_TARGET_AND_PLAN_REQUIRED/);
    assert.doesNotMatch(result.stderr, /Can't reach database|DATABASE_URL|postgresql:\/\//);
  }
});
