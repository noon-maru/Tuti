export type DogOuting = { weightsKg: number[]; leash: boolean; carrier: boolean };
export type DogAccess = { allowed: boolean; areas: string; rules: string; maxWeightKg: number | null; leashRequired: boolean; carrierRequired: boolean; sourceUrl: string; checkedAt: string; validUntil: string };
export function parseDogOuting(value: unknown): DogOuting | null {
  if (!value || typeof value !== "object") return null;
  const v = value as DogOuting;
  return Array.isArray(v.weightsKg) && v.weightsKg.length <= 20 && v.weightsKg.every(w => typeof w === "number" && Number.isFinite(w) && w > 0 && w <= 150) && typeof v.leash === "boolean" && typeof v.carrier === "boolean" ? { weightsKg: v.weightsKg, leash: v.leash, carrier: v.carrier } : null;
}
export function parseDogAccess(value: unknown): DogAccess | null {
  if (!value || typeof value !== "object") return null;
  const v = value as DogAccess;
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
  if ((access.leashRequired && !outing.leash) || (access.carrierRequired && !outing.carrier)) return "ineligible";
  return "eligible";
}
