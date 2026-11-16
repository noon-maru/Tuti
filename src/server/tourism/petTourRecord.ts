import type { PetSource, PetTourItem } from "./petTourClient";
import { PET_SOURCE_URLS } from "./petTourClient";
export type PetTourRecord = { source: PetSource; contentId: string; sourceUrl: string; fetchedAt: string; providerModifiedAt: string | null; facilityVerifiedAt: null; rawPayload: PetTourItem; listPayload: PetTourItem | null };
export function petContentId(item: PetTourItem): string | null {
  const value = item.contentid;
  return typeof value === "string" && /^\d{1,20}$/.test(value) ? value : null;
}
/** Keep each provider's raw conditions. Fetch time is NOT facility verification. */
export function petTourRecord(source: PetSource, item: PetTourItem, fetchedAt: Date, listItem: PetTourItem | null = null): PetTourRecord {
  const contentId = petContentId(item);
  if (!contentId || listItem && petContentId(listItem) !== contentId) throw new Error("PET_CONTENT_ID_MISMATCH");
  const modified = listItem?.modifiedtime ?? item.modifiedtime;
  return { source, contentId, sourceUrl: PET_SOURCE_URLS[source], fetchedAt: fetchedAt.toISOString(), providerModifiedAt: typeof modified === "string" && /^\d{8,14}$/.test(modified) ? modified : null, facilityVerifiedAt: null, rawPayload: item, listPayload: listItem };
}
/** Empty fields are unknown, not unrestricted; provide review hints, never publish eligibility. */
export function petReviewHints(raw: PetTourItem) {
  const text = (key: string) => typeof raw[key] === "string" && raw[key].trim() ? raw[key].trim() : null;
  return { animals: text("acmpyPsblCpam"), areas: text("acmpyTypeCd"), requirements: text("acmpyNeedMtr"), additionalInfo: text("etcAcmpyInfo"), riskNotes: text("relaAcdntRiskMtr"), facilities: text("relaPosesFclty") };
}
