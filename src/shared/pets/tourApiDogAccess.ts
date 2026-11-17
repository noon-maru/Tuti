import type { DogOuting } from "./dogAccess";
import { dogConditions, dogConditionsBlocked } from "./dogConditions";

export function officialDogRestriction(raw: unknown): string | null {
  const text = raw && typeof raw === "object" ? (raw as Record<string, unknown>).acmpyPsblCpam : null;
  if (typeof text !== "string") return null;
  if (/^(?:동반\s*)?(?:불가|금지)\s*[.!]?$/u.test(text.trim())) return "official_pet_denial";
  if (/^(?:맹인\s*)?안내견(?:만|\s*전용)?$/u.test(text.trim())) return "official_assistance_dogs_only";
  return null;
}

/** Official listing, not a facility inspection or a guarantee that every condition matches. */
export type TourApiDogAccess = {
  kind: "tourapi";
  source: "kor";
  areas: string;
  animals: string | null;
  preparations: string | null;
  facilities: string | null;
  rules: string;
  maxWeightKg: number | null;
  weightLimitExclusive: boolean;
  leashRequired: boolean | null;
  carrierRequired: boolean | null;
  sourceUrl: string;
  collectedAt: string;
  freshUntil: string;
  needsConfirmation: true;
  conditions?: ReturnType<typeof dogConditions>;
};
export const TOUR_API_PET_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;
export const KOR_PET_SOURCE_URL = "https://www.data.go.kr/data/15101578/openapi.do";

export function tourApiDogAccess(raw: unknown, fetchedAt: Date, now = Date.now()): TourApiDogAccess | null {
  if (officialDogRestriction(raw)) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;
  const text = (key: string) => typeof payload[key] === "string" ? payload[key].trim() : "";
  const areas = text("acmpyTypeCd");
  // No fallback from venue category, generic overview, or the other API's older copy.
  if (!["전구역 동반가능", "일부구역 동반가능"].includes(areas)) return null;
  const collected = fetchedAt.getTime();
  if (!Number.isFinite(collected) || collected > now || collected + TOUR_API_PET_FRESHNESS_MS <= now) return null;
  const animals = text("acmpyPsblCpam");
  const preparations = text("acmpyNeedMtr");
  const extra = text("etcAcmpyInfo"), risks = text("relaAcdntRiskMtr"), facilities = text("relaPosesFclty");
  if ([animals, preparations, extra, risks, facilities].some(value => value.length > 5000)) return null;
  if (/(?:반려견|강아지|애견)\s*(?:동반|출입|입장)?\s*(?:불가|금지)|고양이만|반려묘\s*전용/.test(animals)) return null;
  // Explicit bounds across condition fields are structured; unsupported conditions stay visible.
  const tokens = preparations.split(",").map(value => value.trim());
  const free = preparations === "자유이용";
  const conditions = dogConditions(areas, [areas, animals, preparations, extra, risks].join("\n"));
  return {
    kind: "tourapi", source: "kor", areas, animals: animals || null, preparations: preparations || null, facilities: facilities || null,
    rules: [extra, risks && risks !== animals ? risks : ""].filter(Boolean).join("\n"),
    conditions, maxWeightKg: conditions.maxWeightKg, weightLimitExclusive: conditions.weightLimitExclusive,
    leashRequired: tokens.includes("목줄 착용") ? true : free ? false : null,
    carrierRequired: tokens.includes("이동장(켄넬)사용") ? true : free ? false : null,
    sourceUrl: KOR_PET_SOURCE_URL, collectedAt: fetchedAt.toISOString(),
    freshUntil: new Date(collected + TOUR_API_PET_FRESHNESS_MS).toISOString(), needsConfirmation: true,
  };
}

export function tourApiDogAccessStatus(access: TourApiDogAccess, outing?: DogOuting, now = Date.now()): "needs-confirmation" | "blocked" | "unavailable" {
  if (access.source !== "kor" || access.sourceUrl !== KOR_PET_SOURCE_URL || !Number.isFinite(Date.parse(access.collectedAt)) || Date.parse(access.collectedAt) > now || !Number.isFinite(Date.parse(access.freshUntil)) || Date.parse(access.freshUntil) <= now) return "unavailable";
  if (dogConditionsBlocked(access.conditions ?? dogConditions(access.areas, [access.areas, access.animals, access.preparations, access.rules].join("\n")), outing)) return "blocked";
  if (!outing) return "needs-confirmation";
  if (access.maxWeightKg !== null && outing.weightsKg.some(weight => access.weightLimitExclusive ? weight >= access.maxWeightKg! : weight > access.maxWeightKg!)) return "blocked";
  if (access.leashRequired === true && outing.leash === false || access.carrierRequired === true && outing.carrier === false) return "blocked";
  return "needs-confirmation";
}
