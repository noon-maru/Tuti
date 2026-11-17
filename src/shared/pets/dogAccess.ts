export type DogOuting = { weightsKg: number[]; leash: boolean | null; carrier: boolean | null; muzzle?: boolean | null; space?: "any" | "indoor" | "outdoor"; purpose?: "walk" | "cafe" | "outing" };
export type DogAccess = { kind?: "reviewed"; requiresOutingConfirmation?: boolean; allowed: boolean; areas: string; rules: string; maxWeightKg: number | null; leashRequired: boolean; carrierRequired: boolean; sourceUrl: string; checkedAt: string; validUntil: string };
export type DogAccessInfo = DogAccess | import("./tourApiDogAccess").TourApiDogAccess;
export function parseDogOuting(value: unknown): DogOuting | null {
  if (!value || typeof value !== "object") return null;
  const v = value as DogOuting;
  if (v.space !== undefined && !["any", "indoor", "outdoor"].includes(v.space)) return null;
  if (v.muzzle !== undefined && v.muzzle !== null && typeof v.muzzle !== "boolean") return null;
  if (v.purpose !== undefined && !["walk", "cafe", "outing"].includes(v.purpose)) return null;
  return Array.isArray(v.weightsKg) && v.weightsKg.length <= 20 && v.weightsKg.every(w => typeof w === "number" && Number.isFinite(w) && w > 0 && w <= 150) && (v.leash === null || typeof v.leash === "boolean") && (v.carrier === null || typeof v.carrier === "boolean") ? { weightsKg: v.weightsKg, leash: v.leash, carrier: v.carrier, ...(v.purpose ? { purpose: v.purpose } : {}), ...(v.space ? { space: v.space } : {}), ...(v.muzzle !== undefined ? { muzzle: v.muzzle } : {}) } : null;
}
export function parseDogAccess(value: unknown): DogAccess | null {
  if (!value || typeof value !== "object") return null;
  const v = value as DogAccess;
  if (v.kind !== undefined && v.kind !== "reviewed") return null;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof v.sourceUrl !== "string" || typeof v.checkedAt !== "string" || !iso.test(v.checkedAt) || typeof v.validUntil !== "string" || !iso.test(v.validUntil)) return null;
  if (typeof v.allowed !== "boolean" || typeof v.areas !== "string" || !v.areas.trim() || v.areas.length > 500 || typeof v.rules !== "string" || v.rules.length > 2000 || typeof v.leashRequired !== "boolean" || typeof v.carrierRequired !== "boolean" || (v.maxWeightKg !== null && (typeof v.maxWeightKg !== "number" || !Number.isFinite(v.maxWeightKg) || v.maxWeightKg <= 0 || v.maxWeightKg > 150))) return null;
  try { const url = new URL(v.sourceUrl); if (url.protocol !== "https:" || url.username || url.password || v.sourceUrl.length > 1000) return null; } catch { return null; }
  if (!Number.isFinite(Date.parse(v.checkedAt)) || !Number.isFinite(Date.parse(v.validUntil)) || Date.parse(v.validUntil) <= Date.parse(v.checkedAt)) return null;
  return v;
}
/** No score, exposure bonus or fallback can change an unknown/ineligible entry into a match. */
export function dogAccessStatus(access: DogAccess | null | undefined, outing: DogOuting, now = Date.now()): "eligible" | "ineligible" | "unknown" {
  if (!access || !parseDogAccess(access) || Date.parse(access.checkedAt) > now || Date.parse(access.validUntil) <= now) return "unknown";
  if (!access.allowed) return "ineligible";
  if (access.maxWeightKg !== null && !outing.weightsKg.length) return "unknown";
  if (access.maxWeightKg !== null && outing.weightsKg.some(w => w > access.maxWeightKg!)) return "ineligible";
  if ((access.leashRequired && outing.leash === false) || (access.carrierRequired && outing.carrier === false)) return "ineligible";
  if ((access.leashRequired && outing.leash === null) || (access.carrierRequired && outing.carrier === null)) return "unknown";
  return "eligible";
}
