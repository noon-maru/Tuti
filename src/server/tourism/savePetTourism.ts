import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { PetTourRecord } from "./petTourRecord";
export async function savePetTourism(records: PetTourRecord[]) {
  await prisma.$transaction(async tx => {
    for (const record of records) {
      // Keep unmatched records too: pet-only venues are not automatically recommendation candidates.
      const place = await tx.place.findFirst({ where: { source: "tourapi", sourceId: record.contentId }, select: { id: true } });
      const data = { placeId: place?.id ?? null, rawPayload: record.rawPayload as Prisma.InputJsonObject,
        listPayload: record.listPayload ? record.listPayload as Prisma.InputJsonObject : Prisma.DbNull,
        sourceUrl: record.sourceUrl, fetchedAt: new Date(record.fetchedAt), providerModifiedAt: record.providerModifiedAt, facilityVerifiedAt: null };
      // Older responses cannot overwrite a newer collection; verified manual DogPlaceAccess is untouched.
      await tx.tourismPetSourceRecord.createMany({ data: [{ ...data, source: record.source, contentId: record.contentId }], skipDuplicates: true });
      await tx.tourismPetSourceRecord.updateMany({ where: { source: record.source, contentId: record.contentId, fetchedAt: { lte: new Date(record.fetchedAt) } }, data });
    }
  }, { timeout: 30000 });
}
