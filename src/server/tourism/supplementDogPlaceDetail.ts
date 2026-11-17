import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { normalizeTourApiPlaceDetail } from "./enrichTourismPlaceDetail";
import { createEditorialFieldRepairs } from "./placeEditorialRepair";
import type { TourApiPlaceDetailPayload } from "./tourApiDetailClient";

export type DogDetailSupplement = { contentId: string; fetchedAt: string; payload: TourApiPlaceDetailPayload };
export function supplementSourceSnapshot(current: unknown, incoming: Record<string, unknown> | null) {
  const old = current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return { ...incoming, ...Object.fromEntries(Object.entries(old).filter(([, value]) => value !== null && value !== "")) } as Prisma.InputJsonObject;
}
export async function supplementDogPlaceDetail(record: DogDetailSupplement, apply = false) {
  if (!/^\d{1,20}$/.test(record.contentId) || record.payload.common?.contentid !== record.contentId || !Number.isFinite(Date.parse(record.fetchedAt)) || Date.parse(record.fetchedAt) > Date.now()) throw Error("INVALID_SOURCE");
  const normalized = normalizeTourApiPlaceDetail(record.payload);
  return prisma.$transaction(async tx => {
    const source = await tx.tourismPlaceSourceRecord.findUnique({ where: { contentId: record.contentId }, include: { detailRecord: true } });
    if (!source?.linkedPlaceId) return { contentId: record.contentId, status: "unregistered" };
    const empty = { overview: null, homepage: null, phone: null, openingHours: null, restDate: null, admissionFee: null, parking: null, reservation: null, usageDuration: null, experienceGuide: null };
    const repairs = createEditorialFieldRepairs(source.detailRecord ?? empty, normalized.fields);
    const fields = Object.keys(repairs);
    const place = await tx.place.findUniqueOrThrow({ where: { id: source.linkedPlaceId }, select: { image: true, sourceCopyright: true } });
    const candidate = [record.payload.common?.firstimage, record.payload.common?.firstimage2, ...record.payload.images.map(image => image.originimgurl)].find(value => {
      if (typeof value !== "string") return false;
      try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && url.hostname === "tong.visitkorea.or.kr" && !url.username && !url.password; } catch { return false; }
    });
    const image = typeof candidate === "string" && !place.image.trim() ? candidate.replace(/^http:/, "https:") : null;
    const imageRecord = record.payload.images.find(row => row.originimgurl === candidate);
    const copyright = imageRecord?.cpyrhtDivCd ?? record.payload.common?.cpyrhtDivCd;
    if (apply) {
      const raw = { commonPayload: record.payload.common as Prisma.InputJsonObject, introPayload: record.payload.intro ? record.payload.intro as Prisma.InputJsonObject : Prisma.DbNull,
        imagePayload: record.payload.images as Prisma.InputJsonArray, syncedAt: new Date(record.fetchedAt) };
      if (source.detailRecord) {
        // Keep the existing source snapshot and editorial values; optimistic lock catches concurrent edits.
        const result = await tx.tourismPlaceDetailRecord.updateMany({ where: { contentId: record.contentId, updatedAt: source.detailRecord.updatedAt }, data: { ...repairs,
          commonPayload: supplementSourceSnapshot(source.detailRecord.commonPayload, record.payload.common),
          introPayload: supplementSourceSnapshot(source.detailRecord.introPayload, record.payload.intro),
          editorialSyncedAt: new Date(record.fetchedAt),
        } });
        if (result.count !== 1) throw Error("DETAIL_CHANGED");
      } else await tx.tourismPlaceDetailRecord.create({ data: { contentId: record.contentId, contentTypeId: source.contentTypeId, ...repairs, ...raw } });
      if (image) await tx.place.updateMany({ where: { id: source.linkedPlaceId, image: place.image }, data: { image, sourceCopyright: typeof copyright === "string" && copyright ? copyright : place.sourceCopyright } });
    }
    return { contentId: record.contentId, status: apply ? "applied" : "dry-run", fields, imageAdded: Boolean(image), unresolved: [!repairs.overview && !source.detailRecord?.overview && "overview", !repairs.openingHours && !source.detailRecord?.openingHours && "openingHours", !image && !place.image && "image"].filter(Boolean) };
  });
}
