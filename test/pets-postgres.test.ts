import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

test("격리 PostgreSQL에서 프로필·마디 연결 원자성·삭제·병합·동반 조건을 검증한다", { timeout: 30000 }, async t => {
  const bin = (name: string) => process.env.POSTGRES_BIN_DIR ? join(process.env.POSTGRES_BIN_DIR, name) : name;
  if (process.getuid?.() === 0 || ["initdb", "pg_ctl"].some(name => spawnSync(bin(name), ["--version"]).status !== 0)) {
    if (process.env.LEGAL_POSTGRES_REQUIRED === "true") throw new Error("격리 PostgreSQL 실행 환경이 필요합니다.");
    t.skip("일반 사용자·PostgreSQL 실행 파일 필요"); return;
  }
  const root = mkdtempSync(join(tmpdir(), "tuti-pets-")), data = join(root, "data"), socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const env = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", NODE_ENV: "test" as const };
  let started = false;
  const db = new pg.Client({ host: socket, port: 15493, user: "fixture", database: "postgres" });
  const orm = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15493, user: "fixture", database: "postgres" }) });
  const globalDb = globalThis as unknown as { prisma?: unknown };
  const previous = globalDb.prisma, ledgerEnabled = process.env.PRIVACY_REPLAY_LEDGER_ENABLED;
  t.after(async () => {
    globalDb.prisma = previous;
    if (ledgerEnabled === undefined) delete process.env.PRIVACY_REPLAY_LEDGER_ENABLED; else process.env.PRIVACY_REPLAY_LEDGER_ENABLED = ledgerEnabled;
    await orm.$disconnect(); await db.end();
    if (started) execFileSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env, stdio: "pipe" });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync(bin("initdb"), ["-D", data, "-U", "fixture", "--no-locale", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync(bin("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15493 -c listen_addresses='' -c shared_buffers=16MB -c fsync=off`, "-w", "-t", "10", "start"], { env, stdio: "pipe" });
  started = true;
  await db.connect();
  await db.query("CREATE TABLE users(id text PRIMARY KEY); CREATE TABLE journal_entries(id text PRIMARY KEY,owner_id text REFERENCES users(id) ON DELETE CASCADE); CREATE TABLE places(id text PRIMARY KEY); INSERT INTO users VALUES('owner'),('other'),('target'); INSERT INTO journal_entries VALUES('original','owner'); INSERT INTO places VALUES('place');");
  for (const path of ["20261116010000_optional_pet_profiles", "20261116020000_dog_place_access", "20261116030000_tourism_pet_sources"]) await db.query(readFileSync(`prisma/migrations/${path}/migration.sql`, "utf8"));
  await db.query("ALTER TABLE places ADD COLUMN source text, ADD COLUMN source_id text; UPDATE places SET source='tourapi',source_id='1' WHERE id='place'");
  globalDb.prisma = orm; process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
  const { createPet, updatePet, deletePet, linkMadiPets } = await import("../src/server/pets/service");
  const pet = await createPet("owner", { name: "모모", species: "dog", weightKg: 8 });
  const other = await createPet("other", { name: "다른 보호자", species: "cat" });
  await assert.rejects(orm.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO journal_entries VALUES ('rollback', 'owner')`;
    await linkMadiPets(tx, "owner", "rollback", [other.id]);
  }), /다시 확인/);
  assert.equal((await db.query("SELECT count(1)::int n FROM journal_entries WHERE id='rollback'")).rows[0].n, 0);
  await orm.$transaction(tx => linkMadiPets(tx, "owner", "original", [pet.id]));
  assert.equal(await orm.madiPetLink.count(), 1);
  await updatePet("owner", pet.id, { name: "모모 수정", species: "dog", revision: 0 });
  await assert.rejects(updatePet("owner", pet.id, { name: "오래된 편집", species: "dog", revision: 0 }), /바뀌었어요/);
  await assert.rejects(deletePet("other", pet.id), /찾지 못했어요/);
  await db.query("BEGIN; UPDATE journal_entries SET owner_id='target' WHERE owner_id='owner'; UPDATE pet_profiles SET owner_id='target' WHERE owner_id='owner'; DELETE FROM users WHERE id='owner'; COMMIT");
  assert.equal(await orm.madiPetLink.count(), 1, "이전한 프로필·원본 연결 보존");
  await deletePet("target", pet.id);
  assert.equal(await orm.madiPetLink.count(), 0);
  assert.equal((await db.query("SELECT count(1)::int n FROM journal_entries WHERE id='original'")).rows[0].n, 1);
  await orm.dogPlaceAccess.create({ data: { placeId: "place", allowed: true, areas: "야외", rules: "실내 제외", maxWeightKg: 10, leashRequired: true, carrierRequired: false, sourceUrl: "https://fixture.example/notice", checkedAt: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 3600000) } });
  const { dogOutingPlaces } = await import("../src/server/pets/dogAccess");
  const places = [{ id: "place" }, { id: "unknown" }];
  assert.equal((await dogOutingPlaces(places, { weightsKg: [8], leash: true, carrier: false })).length, 1);
  assert.equal((await dogOutingPlaces(places, { weightsKg: [8, 15], leash: true, carrier: false })).length, 0);
  const { savePetTourism } = await import("../src/server/tourism/savePetTourism");
  const { petTourRecord } = await import("../src/server/tourism/petTourRecord");
  await savePetTourism([
    petTourRecord("kor", { contentid: "1", acmpyNeedMtr: "목줄" }, new Date("2026-11-16T00:00:00Z")),
    petTourRecord("pet", { contentid: "1" }, new Date("2026-11-16T00:00:00Z")),
    petTourRecord("pet", { contentid: "999" }, new Date("2026-11-16T00:00:00Z")),
  ]);
  assert.equal(await orm.tourismPetSourceRecord.count(), 3, "출처별 원문·미매칭 장소 보존");
  assert.equal((await orm.tourismPetSourceRecord.findUniqueOrThrow({ where: { source_contentId: { source: "pet", contentId: "999" } } })).placeId, null);
  await savePetTourism([petTourRecord("kor", { contentid: "1", acmpyNeedMtr: "과거" }, new Date("2026-11-15T00:00:00Z"))]);
  assert.equal((await db.query("SELECT raw_payload->>'acmpyNeedMtr' v FROM tourism_pet_source_records WHERE source='kor'")).rows[0].v, "목줄", "오래된 응답으로 최신 조건을 덮어쓰지 않음");
  assert.equal((await orm.dogPlaceAccess.findUniqueOrThrow({ where: { placeId: "place" } })).rules, "실내 제외", "검토된 추천 조건은 덮어쓰지 않음");
  await assert.rejects(savePetTourism([petTourRecord("kor", { contentid: "2" }, new Date()), { ...petTourRecord("kor", { contentid: "3" }, new Date()), source: "invalid" as "kor" }]));
  assert.equal(await orm.tourismPetSourceRecord.count(), 3, "페이지 저장 실패는 전체 롤백");
  await db.query("INSERT INTO places VALUES ('listed','tourapi','2'),('pet-only','tourapi','3'),('stale','tourapi','4')");
  await savePetTourism([
    petTourRecord("kor", { contentid: "1", acmpyTypeCd: "전구역 동반가능" }, new Date()),
    petTourRecord("kor", { contentid: "2", acmpyTypeCd: "전구역 동반가능" }, new Date()),
    petTourRecord("pet", { contentid: "3", acmpyTypeCd: "전구역 동반가능" }, new Date()),
    petTourRecord("kor", { contentid: "4", acmpyTypeCd: "전구역 동반가능" }, new Date(Date.now() - 31 * 86400000)),
  ]);
  const officialCandidates = [{ id: "place" }, { id: "listed" }, { id: "pet-only" }, { id: "stale" }, { id: "unknown" }];
  const recommended = await dogOutingPlaces(officialCandidates, { weightsKg: [15], leash: true, carrier: false });
  assert.deepEqual(recommended.map(place => place.id), ["listed"], "검토 제한을 우회하지 않고 국문·최신·등록 자료만 포함");
  assert.equal(recommended[0].dogAccess.kind, "tourapi");
  await orm.dogPlaceAccess.update({ where: { placeId: "place" }, data: { allowed: false } });
  assert.equal((await dogOutingPlaces([{ id: "place" }], { weightsKg: [5], leash: true, carrier: true })).length, 0, "동반 불가 검토 자료를 원문으로 우회하지 않음");
  await db.query("DELETE FROM users WHERE id='other'");
  assert.equal(await orm.petProfile.count(), 0, "계정 삭제 시 프로필 제거");
});
