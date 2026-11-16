import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { HarumadiError } from "@/server/harumadi/errors";
import { parsePetProfile } from "@/shared/pets/profile";
import { preparePrivacyReplayReceipt, commitPrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";

const select = { id: true, name: true, species: true, weightKg: true, revision: true } as const;
export const readPets = (ownerId: string) => prisma.petProfile.findMany({ where: { ownerId }, select, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
export async function createPet(ownerId: string, body: unknown) {
  const input = parsePetProfile(body);
  if (!input) throw new HarumadiError("이름·종류·몸무게를 확인해주세요.");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
    if (await tx.petProfile.count({ where: { ownerId } }) >= 50) throw new HarumadiError("프로필은 계정당 50개까지 등록할 수 있어요.");
    return tx.petProfile.create({ data: { id: crypto.randomUUID(), ownerId, ...input }, select });
  });
}
/** Caller holds the account lock. Linking never grants access to another person's pet or book. */
export async function linkMadiPets(tx: Prisma.TransactionClient, ownerId: string, entryId: string, petIds: string[] | undefined) {
  if (petIds === undefined) return;
  const pets = await tx.petProfile.findMany({ where: { ownerId, id: { in: petIds } }, select: { id: true } });
  if (pets.length !== petIds.length) throw new HarumadiError("선택한 반려동물 정보가 바뀌었어요. 연결을 다시 확인해주세요.", 409);
  await tx.madiPetLink.deleteMany({ where: { entryId } });
  if (petIds.length) await tx.madiPetLink.createMany({ data: petIds.map(petId => ({ entryId, petId })) });
}
export async function deletePet(ownerId: string, id: string) {
  // A pet deletion removes links, never the original madi, books, comments or exported PDF.
  if (!await prisma.petProfile.findFirst({ where: { id, ownerId }, select: { id: true } })) throw new HarumadiError("프로필을 찾지 못했어요.", 404);
  const receipt = await preparePrivacyReplayReceipt("pet_deleted", ownerId, new Date(), id);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
    const removed = await tx.petProfile.deleteMany({ where: { id, ownerId } });
    if (!removed.count && await tx.petProfile.findUnique({ where: { id }, select: { id: true } })) throw new HarumadiError("계정 상태가 바뀌었어요. 다시 확인해주세요.", 409);
  });
  await commitPrivacyReplayReceipt(receipt);
  return { deleted: true };
}

export async function updatePet(ownerId: string, id: string, body: unknown) {
  const input = parsePetProfile(body);
  const revision = body && typeof body === "object" && "revision" in body ? body.revision : undefined;
  if (!input || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new HarumadiError("프로필을 다시 확인해주세요.");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
    const changed = await tx.petProfile.updateMany({ where: { id, ownerId, revision }, data: { ...input, revision: { increment: 1 } } });
    if (!changed.count) throw new HarumadiError("다른 화면에서 프로필이 바뀌었어요. 다시 불러와주세요.", 409);
    return tx.petProfile.findFirst({ where: { id, ownerId }, select });
  });
}
