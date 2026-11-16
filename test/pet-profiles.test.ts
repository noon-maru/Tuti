import assert from "node:assert/strict";
import test from "node:test";
import { parsePetProfile, validPetIds } from "../src/shared/pets/profile";
import { dogAccessStatus, parseDogAccess, parseDogOuting, type DogAccess } from "../src/shared/pets/dogAccess";
import { linkMadiPets } from "../src/server/pets/service";
import type { Prisma } from "../src/generated/prisma/client";

test("선택 프로필은 이름·종·선택 몸무게만 받고 0~N 연결을 허용한다", () => {
  assert.deepEqual(parsePetProfile({ name: " 모모 ", species: "cat" }), { name: "모모", species: "cat", weightKg: null });
  for (const value of [{ name: "", species: "dog" }, { name: "모모", species: "unknown" }, { name: "모모", species: "dog", weightKg: Infinity }, { name: "모모", species: "dog", weightKg: -1 }]) assert.equal(parsePetProfile(value), null);
  assert.equal(validPetIds([]), true);
  assert.equal(validPetIds(["a", "b"]), true);
  for (const value of [["a", "a"], ["../private"], [null], "a"]) assert.equal(validPetIds(value), false);
});

test("마디의 반려동물 연결은 본인 프로필만 허용하고 검증 실패 때 연결을 건드리지 않는다", async () => {
  const writes: unknown[] = [];
  const tx = { petProfile: { findMany: async ({ where }: { where: { ownerId: string; id: { in: string[] } } }) => where.ownerId === "owner" ? where.id.in.filter(id => id !== "other").map(id => ({ id })) : [] }, madiPetLink: { deleteMany: async (arg: unknown) => { writes.push(arg); }, createMany: async (arg: unknown) => { writes.push(arg); } } } as unknown as Prisma.TransactionClient;
  await linkMadiPets(tx, "owner", "entry", undefined);
  assert.equal(writes.length, 0, "구버전 수정 요청은 기존 연결 보존");
  await assert.rejects(linkMadiPets(tx, "owner", "entry", ["other"]));
  assert.equal(writes.length, 0);
  await linkMadiPets(tx, "owner", "entry", ["a", "b"]);
  assert.equal(writes.length, 2);
});

test("동반 판단은 확인됨·불충족·미확인을 구분하고 모든 동반견·준비 조건을 확인한다", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const access: DogAccess = { allowed: true, areas: "야외 테라스", rules: "실내 제외", maxWeightKg: 10, leashRequired: true, carrierRequired: false, sourceUrl: "https://venue.example/notice", checkedAt: "2026-11-15T00:00:00Z", validUntil: "2026-12-01T00:00:00Z" };
  const outing = { weightsKg: [5, 8], leash: true, carrier: false };
  assert.ok(parseDogAccess(access));
  assert.equal(dogAccessStatus(access, outing, now), "eligible");
  assert.equal(dogAccessStatus(access, { ...outing, weightsKg: [5, 12] }, now), "ineligible");
  assert.equal(dogAccessStatus(access, { ...outing, weightsKg: [] }, now), "unknown");
  assert.equal(dogAccessStatus(access, { ...outing, leash: false }, now), "ineligible");
  assert.equal(dogAccessStatus({ ...access, allowed: false }, outing, now), "ineligible");
  assert.equal(dogAccessStatus({ ...access, carrierRequired: true }, outing, now), "ineligible");
  assert.equal(dogAccessStatus(access, outing, Date.parse(access.validUntil)), "unknown");
  assert.equal(dogAccessStatus(undefined, outing, now), "unknown");
  assert.equal(dogAccessStatus({ ...access, sourceUrl: "javascript:alert(1)" }, outing, now), "unknown");
  assert.equal(dogAccessStatus({ ...access, checkedAt: "2026-11-17T00:00:00Z" }, outing, now), "unknown");
  assert.equal(parseDogOuting({ ...outing, weightsKg: [-1] }), null);
  assert.equal(parseDogOuting({ ...outing, leash: "true" }), null);
});
