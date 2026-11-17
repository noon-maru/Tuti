import { prisma } from "@/server/db/prisma";
import { dogAccessStatus, parseDogAccess, type DogAccessInfo, type DogOuting } from "@/shared/pets/dogAccess";
import { tourApiDogAccess, tourApiDogAccessStatus } from "@/shared/pets/tourApiDogAccess";
export async function dogOutingPlaces<T extends { id: string }>(places: T[], outing?: DogOuting): Promise<(T & { dogAccess: DogAccessInfo })[]> {
  if (!places.length) return [];
  const ids = places.map(place => place.id);
  const [rows, sources] = await Promise.all([
    prisma.dogPlaceAccess.findMany({ where: { placeId: { in: ids } } }),
    prisma.tourismPetSourceRecord.findMany({ where: { source: "kor", placeId: { in: ids } }, select: { placeId: true, rawPayload: true, fetchedAt: true } }),
  ]);
  const reviewed = new Map(rows.map(row => [row.placeId, { ...row, checkedAt: row.checkedAt.toISOString(), validUntil: row.validUntil.toISOString() }]));
  const official = new Map(sources.map(row => [row.placeId, row]));
  const now = Date.now();
  return places.flatMap((place): (T & { dogAccess: DogAccessInfo })[] => {
    const access = reviewed.get(place.id);
    // Negative, expired or mismatching reviewed restrictions cannot be bypassed by an API listing.
    if (access) {
      if (!outing) return parseDogAccess(access) && access.allowed && Date.parse(access.checkedAt) <= now && Date.parse(access.validUntil) > now ? [{ ...place, dogAccess: { ...access, requiresOutingConfirmation: true } }] : [];
      return dogAccessStatus(access, outing, now) === "eligible" ? [{ ...place, dogAccess: access }] : [];
    }
    const record = official.get(place.id);
    const listed = record ? tourApiDogAccess(record.rawPayload, record.fetchedAt, now) : null;
    return listed && tourApiDogAccessStatus(listed, outing, now) === "needs-confirmation" ? [{ ...place, dogAccess: listed }] : [];
  });
}
