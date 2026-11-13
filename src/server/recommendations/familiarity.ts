import { prisma } from "@/server/db/prisma";
import { PLACE_FAMILIARITY_RETENTION_DAYS } from "@/shared/api/placeFamiliarity";
import { recommendablePlaceWhere } from "./recommendablePlaceWhere";
import type { Prisma } from "@/generated/prisma/client";

export async function readPlaceFamiliarity(userId: string, placeId: string, now = new Date(), database = prisma) {
  const row = await database.placeFamiliarity.findUnique({ where: { userId_placeId: { userId, placeId } }, select: { expiresAt: true } });
  return { placeId, familiar: Boolean(row && row.expiresAt > now) };
}

export async function setPlaceFamiliarity(userId: string, placeId: string, familiar: boolean, now = new Date(), database = prisma) {
  return database.$transaction(async tx => {
    if (!familiar) {
      await tx.placeFamiliarity.deleteMany({ where: { userId, placeId } });
      return { placeId, familiar: false };
    }
    const place = await tx.place.findFirst({ where: { AND: [{ id: placeId }, recommendablePlaceWhere] }, select: { id: true } });
    if (!place) return null;
    const expiresAt = new Date(now.getTime() + PLACE_FAMILIARITY_RETENTION_DAYS * 86400_000);
    await tx.placeFamiliarity.upsert({ where: { userId_placeId: { userId, placeId } },
      create: { userId, placeId, markedAt: now, expiresAt }, update: { markedAt: now, expiresAt } });
    return { placeId, familiar: true };
  });
}

/** 사용자 승인 병합의 트랜잭션 안에서 호출한다. 더 최근의 표시를 보존한다. */
export async function mergePlaceFamiliarities(tx: Prisma.TransactionClient, sourceId: string, targetId: string, now = new Date()) {
  if (sourceId === targetId) return;
  await tx.$executeRaw`INSERT INTO place_familiarities(user_id,place_id,marked_at,expires_at)
    SELECT ${targetId},place_id,marked_at,expires_at FROM place_familiarities WHERE user_id=${sourceId} AND expires_at>${now}
    ON CONFLICT(user_id,place_id) DO UPDATE SET
      marked_at=GREATEST(place_familiarities.marked_at,EXCLUDED.marked_at),
      expires_at=GREATEST(place_familiarities.expires_at,EXCLUDED.expires_at)`;
}
