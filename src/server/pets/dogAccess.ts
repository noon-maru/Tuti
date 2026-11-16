import { prisma } from "@/server/db/prisma";
import { dogAccessStatus, type DogAccess, type DogOuting } from "@/shared/pets/dogAccess";
export async function eligibleDogPlaces<T extends { id: string }>(places: T[], outing: DogOuting): Promise<(T & { dogAccess: DogAccess })[]> {
  const rows = await prisma.dogPlaceAccess.findMany({ where: { placeId: { in: places.map(place => place.id) } } });
  const access = new Map(rows.map(row => [row.placeId, { ...row, checkedAt: row.checkedAt.toISOString(), validUntil: row.validUntil.toISOString() }]));
  const now = Date.now();
  return places.filter(place => dogAccessStatus(access.get(place.id), outing, now) === "eligible").map(place => ({ ...place, dogAccess: access.get(place.id)! }));
}
