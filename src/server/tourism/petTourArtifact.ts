import { createHash } from "node:crypto";
import { petContentId, petTourRecord, type PetTourRecord } from "./petTourRecord";
import { PET_SOURCE_URLS, type PetSource } from "./petTourClient";
import { tourApiDogAccess } from "@/shared/pets/tourApiDogAccess";

export function parsePetTourArtifact(content: string, source: PetSource = "kor", now = Date.now()) {
  if (source !== "kor" && source !== "pet" || Buffer.byteLength(content) > 64 * 1024 * 1024) throw new Error("INVALID_ARTIFACT");
  const lines = content.trim().split("\n");
  if (!content.trim() || lines.length > 100000) throw new Error("INVALID_ARTIFACT_SIZE");
  const seen = new Set<string>();
  const records = lines.map(line => {
    const value = JSON.parse(line) as Record<string, unknown>;
    if (!value || typeof value !== "object" || value.source !== source || value.sourceUrl !== PET_SOURCE_URLS[source] || value.facilityVerifiedAt !== null || typeof value.fetchedAt !== "string" || !value.rawPayload || typeof value.rawPayload !== "object" || Array.isArray(value.rawPayload)) throw new Error("INVALID_ARTIFACT_RECORD");
    const date = new Date(value.fetchedAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.fetchedAt || date.getTime() > now) throw new Error("INVALID_ARTIFACT_DATE");
    const raw = value.rawPayload as Record<string, unknown>;
    if (value.contentId !== petContentId(raw) || typeof value.contentId !== "string" || seen.has(value.contentId)) throw new Error("ARTIFACT_DUPLICATE_OR_MISMATCH");
    if (value.listPayload !== null && (!value.listPayload || typeof value.listPayload !== "object" || Array.isArray(value.listPayload))) throw new Error("INVALID_ARTIFACT_LIST");
    const record = petTourRecord(source, raw, date, value.listPayload as PetTourRecord["listPayload"]);
    if (record.providerModifiedAt !== value.providerModifiedAt) throw new Error("INVALID_PROVIDER_DATE");
    seen.add(record.contentId);
    return record;
  });
  return { records, sha256: createHash("sha256").update(content).digest("hex"), source, officialListings: source === "kor" ? records.filter(row => tourApiDogAccess(row.rawPayload, new Date(row.fetchedAt), now)).length : 0 };
}
