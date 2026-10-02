import { createHash } from "node:crypto";
import type { PlaceExperienceType } from "@/lib/recommendations";

export const PLACE_VISIT_TIME_PROFILE_VERSION = "place-visit-time-v3";
export const PLACE_VISIT_TIME_PROFILE_MODEL = "codex-direct";

export type StayDurationSource =
  | "llm_parsed"
  | "type_default"
  | "manual_override";

export type StayDurationRange = {
  minimumMinutes: number;
  typicalMinutes: number;
  maximumMinutes: number;
};

export type PlaceVisitTimeSource = {
  name: string;
  contentTypeId?: string | null;
  experienceType?: PlaceExperienceType | null;
  overview?: string | null;
  overviewSummary?: string | null;
  usageDuration?: string | null;
  experienceGuide?: string | null;
  parking?: string | null;
  reservation?: string | null;
  admissionFee?: string | null;
};

export type ParsedStayDuration = StayDurationRange & {
  source: StayDurationSource;
  confidence: number;
  evidence: string;
};

export function resolveStayDuration(
  source: Pick<PlaceVisitTimeSource, "contentTypeId" | "experienceType">,
  explicit?: ParsedStayDuration,
): ParsedStayDuration {
  if (explicit && explicit.source !== "type_default") return explicit;

  return {
    ...getDefaultStayDuration(source),
    source: "type_default",
    confidence: explicit?.confidence ?? 55,
    evidence:
      explicit?.evidence ??
      `기본 체류시간표: ${source.experienceType ?? source.contentTypeId ?? "other"}`,
  };
}

export function getDefaultStayDuration(
  source: Pick<PlaceVisitTimeSource, "contentTypeId" | "experienceType">,
): StayDurationRange {
  const byExperienceType: Partial<Record<PlaceExperienceType, StayDurationRange>> = {
    waterside: range(20, 50, 90),
    forest_garden: range(20, 45, 90),
    art_exhibition: range(30, 60, 90),
    museum_story: range(30, 60, 100),
    history_heritage: range(20, 50, 90),
    viewpoint: range(20, 40, 60),
    neighborhood: range(20, 45, 90),
    activity: range(60, 100, 180),
    wellness: range(60, 90, 150),
  };
  const byExperience = source.experienceType
    ? byExperienceType[source.experienceType]
    : undefined;
  if (byExperience) return byExperience;

  return {
    "14": range(40, 70, 100),
    "28": range(60, 100, 180),
    "38": range(40, 70, 120),
    "39": range(40, 70, 120),
  }[source.contentTypeId ?? ""] ?? range(30, 60, 100);
}

export function deriveVisitAccessProfile(source: PlaceVisitTimeSource) {
  const text = normalize([
    source.name,
    source.overviewSummary,
    source.overview,
    source.experienceGuide,
    source.reservation,
  ].filter(Boolean).join(" "));
  const accessText = normalize([
    source.overviewSummary,
    source.overview,
    source.experienceGuide,
    source.reservation,
  ].filter(Boolean).join(" "));
  const parkingText = normalize(source.parking ?? "");
  const parkingAvailability = /^(없음|불가|불가능)$|주차\s*(불가|불가능)|주차\s*(?:장|공간)?\s*(없|미운영)|차량\s*진입\s*불가/u.test(parkingText)
    ? "none"
    : /인근|주변|공영\s*주차/u.test(parkingText)
      ? "nearby"
      : parkingText && !/정보\s*없|문의|확인\s*필요/u.test(parkingText)
        ? "onsite"
        : "unknown";
  const reservationRequirement = /사전\s*예약\s*(필수|제)|예약제|예약\s*필수/u.test(text)
    ? "required"
    : /예약\s*(권장|가능)|사전\s*신청/u.test(text)
      ? "recommended"
      : "none";
  const accessConstraint = isRestrictedAccess(accessText)
    ? "restricted"
    : requiresFerryAccess(accessText)
      ? "ferry"
      : /케이블카|삭도/u.test(accessText)
        ? "cablecar"
        : /긴\s*도보|도보\s*\d+\s*분|등산|트레킹|탐방로/u.test(accessText)
          ? "long_walk"
          : "none";
  const stayFlexibility = /공연|극장|영화관|상영|콘서트/u.test(text)
    ? "scheduled"
    : source.experienceType === "activity"
      ? "fixed"
      : "flexible";
  const entryProcess = reservationRequirement === "required"
    ? "checkin"
    : /장비\s*(대여|착용)|안전\s*교육/u.test(text)
      ? "equipment"
      : source.admissionFee && !/무료|없음|해당\s*없음/u.test(source.admissionFee)
        ? "ticket"
        : "open";
  const carAccessUnavailable = /(?:개인\s*)?차량(?:으로)?\s*이동.{0,12}(?:불가|불가능)|(?:개인\s*)?차량\s*진입.{0,12}(?:불가|불가능)/u.test(
    accessText,
  );
  const carSuitability = accessConstraint === "ferry" || carAccessUnavailable
    ? "unavailable"
    : accessConstraint === "restricted"
      ? "difficult"
      : parkingAvailability === "none"
        ? "difficult"
        : parkingAvailability === "unknown"
          ? "possible"
          : "good";

  return {
    stayFlexibility,
    parkingAvailability,
    carSuitability,
    entryProcess,
    reservationRequirement,
    accessConstraint,
    parkingBuffer: getParkingBuffer(parkingAvailability),
    entryBuffer: getEntryBuffer(entryProcess),
  };
}

export function createPlaceVisitTimeSourceFingerprint(source: PlaceVisitTimeSource) {
  return createHash("sha256").update(JSON.stringify({
    name: source.name,
    contentTypeId: source.contentTypeId ?? null,
    experienceType: source.experienceType ?? null,
    overviewSummary: source.overviewSummary ?? null,
    overview: source.overview ?? null,
    usageDuration: source.usageDuration ?? null,
    experienceGuide: source.experienceGuide ?? null,
    parking: source.parking ?? null,
    reservation: source.reservation ?? null,
    admissionFee: source.admissionFee ?? null,
  })).digest("hex");
}

function isRestrictedAccess(value: string) {
  return value.split(/[.!?。]/u).some((sentence) => {
    if (/예전|과거|한때|이전|해제|개방|가능해졌|였으나|었으나/u.test(sentence)) {
      return false;
    }
    return /(?:현재|지금|당분간|상시).{0,30}(?:출입|접근|입산).{0,20}(?:제한|통제|불가능?|금지)|(?:출입|접근|입산).{0,20}(?:제한|통제|불가능?|금지)(?:\s*(?:중|되고|된다|됩니다|함|예정))/u.test(
      sentence,
    );
  });
}

function requiresFerryAccess(value: string) {
  return /(?:여객선|배편|선박|도선)(?:을|를)?\s*(?:이용|탑승)|(?:여객선|배|선박)(?:을|를)?\s*타고\s*(?:들어|이동|건너|도착)|(?:배편|여객선|선박)으로만/u.test(
    value,
  );
}

function getParkingBuffer(value: string): StayDurationRange {
  if (value === "onsite") return range(5, 10, 15);
  if (value === "nearby") return range(10, 15, 25);
  if (value === "none") return range(15, 25, 40);
  return range(10, 20, 30);
}

function getEntryBuffer(value: string): StayDurationRange {
  if (value === "ticket") return range(5, 10, 15);
  if (value === "checkin" || value === "equipment") return range(10, 20, 30);
  return range(0, 5, 10);
}

function range(
  minimumMinutes: number,
  typicalMinutes: number,
  maximumMinutes: number,
): StayDurationRange {
  return { minimumMinutes, typicalMinutes, maximumMinutes };
}

function normalize(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
