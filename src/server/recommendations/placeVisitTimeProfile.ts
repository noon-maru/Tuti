import { createHash } from "node:crypto";
import type { PlaceExperienceType } from "@/lib/recommendations";

export const PLACE_VISIT_TIME_PROFILE_VERSION = "place-visit-time-v4";
export const PLACE_VISIT_TIME_PROFILE_MODEL = "codex-direct";
export const PLACE_VISIT_TIME_DEFAULT_MODEL = "rule-table-v2";

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

export type DefaultStayDurationProfileId =
  | "water_park"
  | "amusement_park"
  | "zoo_aquarium"
  | "winter_sports"
  | "golf_course"
  | "active_leisure"
  | "leisure_content"
  | "large_museum_gallery"
  | "botanical_garden"
  | "mountain_trail"
  | "palace_complex"
  | `experience:${PlaceExperienceType}`
  | `content:${string}`
  | "other";

type DefaultStayDurationSource = Partial<PlaceVisitTimeSource> &
  Pick<PlaceVisitTimeSource, "contentTypeId" | "experienceType">;

export type DefaultStayDurationProfile = StayDurationRange & {
  id: DefaultStayDurationProfileId;
  confidence: number;
  evidence: string;
};

export function resolveStayDuration(
  source: DefaultStayDurationSource,
  explicit?: ParsedStayDuration,
): ParsedStayDuration {
  if (explicit && explicit.source !== "type_default") return explicit;

  const fallback = getDefaultStayDurationProfile(source);

  return {
    minimumMinutes: fallback.minimumMinutes,
    typicalMinutes: fallback.typicalMinutes,
    maximumMinutes: fallback.maximumMinutes,
    source: "type_default",
    confidence: explicit?.confidence ?? fallback.confidence,
    evidence: explicit?.evidence ?? fallback.evidence,
  };
}

export function getDefaultStayDuration(
  source: DefaultStayDurationSource,
): StayDurationRange {
  const profile = getDefaultStayDurationProfile(source);
  return range(
    profile.minimumMinutes,
    profile.typicalMinutes,
    profile.maximumMinutes,
  );
}

export function getDefaultStayDurationProfile(
  source: DefaultStayDurationSource,
): DefaultStayDurationProfile {
  const name = normalize(source.name ?? "");
  const description = normalize(
    source.overviewSummary?.trim() || source.overview || "",
  );
  const identityText = normalize([
    source.name,
    firstSentence(description),
  ].filter(Boolean).join(" "));
  const facilityText = normalize([
    source.name,
    description,
    source.experienceGuide,
  ].filter(Boolean).join(" "));

  // 장소별 목록이 아니라 시설 성격을 나타내는 공개 설명의 신호를 사용한다.
  // 넓은 경험 유형보다 준비와 이용 시간이 분명한 시설 규칙을 먼저 적용한다.
  if (
    hasPairedSignals(
      facilityText,
      /워터\s*파크|워터월드|아쿠아월드/u,
      /물놀이|수영장|파도풀|유수풀|슬라이드|온천|스파|사우나/u,
    ) ||
    hasPairedSignals(facilityText, /파도풀|유수풀/u, /워터\s*슬라이드|튜브\s*슬라이드|바디\s*슬라이드/u)
  ) {
    return profile("water_park", 120, 240, 420, 78, "워터파크·복합 물놀이 시설");
  }
  if (
    hasPairedSignals(
      facilityText,
      /놀이공원|어뮤즈먼트\s*파크|테마파크/u,
      /놀이기구|어트랙션|롤러코스터|회전목마|바이킹|대관람차/u,
    )
  ) {
    return profile("amusement_park", 120, 240, 420, 75, "놀이공원·어트랙션 시설");
  }
  if (/동물원|아쿠아리움|수족관/u.test(identityText)) {
    return profile("zoo_aquarium", 90, 150, 240, 75, "동물원·수족관 시설");
  }
  if (/스키장|스노(?:우)?보드|스노파크/u.test(identityText)) {
    return profile("winter_sports", 120, 240, 420, 78, "스키·설상 레포츠 시설");
  }
  if (/골프장|컨트리\s*클럽|(?:^|\s)CC(?:\s|$)/iu.test(identityText)) {
    return profile("golf_course", 180, 270, 360, 72, "골프 코스 시설");
  }
  if (
    /래프팅|서핑|패러글라이딩|짚라인|집라인|번지점프|카트(?:장|체험)|\bATV\b|승마(?:장|체험)|카누|카약|요트|스쿠버|다이빙|클라이밍|(?:^|\s)루지(?:\s|$|체험|트랙|시설|장)|레일바이크/iu.test(facilityText)
  ) {
    return profile("active_leisure", 60, 120, 240, 72, "장비·코스형 레포츠 시설");
  }
  if (source.contentTypeId === "28") {
    return profile("leisure_content", 60, 120, 240, 65, "관광정보 레포츠 콘텐츠 유형");
  }
  if (isLargeMuseumOrGallery(name, facilityText)) {
    return profile("large_museum_gallery", 60, 120, 210, 70, "복수 전시공간을 갖춘 대형 박물관·미술관");
  }
  if (/수목원|식물원|국가정원|자연휴양림/u.test(name)) {
    return profile("botanical_garden", 60, 120, 240, 70, "수목원·식물원·휴양림");
  }
  if (source.experienceType !== "activity" && isMountainOrTrail(name, facilityText)) {
    return profile("mountain_trail", 90, 180, 360, 68, "정상·코스를 이동하는 산행 장소");
  }
  if (isPalaceComplex(name, facilityText)) {
    return profile("palace_complex", 60, 120, 180, 68, "여러 전각을 둘러보는 궁궐 단지");
  }

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
  const experienceType = source.experienceType;
  const byExperience = experienceType
    ? byExperienceType[experienceType]
    : undefined;
  if (byExperience) {
    return {
      ...byExperience,
      id: `experience:${experienceType}` as DefaultStayDurationProfileId,
      confidence: 55,
      evidence: `경험 유형 기본 체류시간표: ${experienceType}`,
    };
  }

  const byContentType = {
    "14": range(40, 70, 100),
    "38": range(40, 70, 120),
    "39": range(40, 70, 120),
  }[source.contentTypeId ?? ""];
  if (byContentType) {
    return {
      ...byContentType,
      id: `content:${source.contentTypeId}`,
      confidence: 50,
      evidence: `관광 콘텐츠 유형 기본 체류시간표: ${source.contentTypeId}`,
    };
  }
  return profile("other", 30, 60, 100, 45, "일반 관광 장소 기본 체류시간표");
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

function profile(
  id: DefaultStayDurationProfileId,
  minimumMinutes: number,
  typicalMinutes: number,
  maximumMinutes: number,
  confidence: number,
  evidence: string,
): DefaultStayDurationProfile {
  return {
    id,
    minimumMinutes,
    typicalMinutes,
    maximumMinutes,
    confidence,
    evidence: `시설 성격 기본 체류시간표(${id}): ${evidence}`,
  };
}

function hasPairedSignals(value: string, first: RegExp, second: RegExp) {
  return first.test(value) && second.test(value);
}

function isLargeMuseumOrGallery(name: string, text: string) {
  const museumSignal = /박물관|미술관|뮤지엄|과학관|전시관/u;
  if (!museumSignal.test(text)) return false;
  if (/국립.{0,20}(?:박물관|미술관|과학관)/u.test(name)) return true;

  return /여러\s*(?:전시관|전시실)|복수의?\s*(?:전시관|전시실)|대형\s*(?:박물관|미술관|전시관|전시실)|상설\s*전시.{0,40}기획\s*전시|기획\s*전시.{0,40}상설\s*전시|(?:4|5|6|7|8|9|\d{2,})\s*개(?:의)?\s*(?:전시관|전시실)|(?:4|5|6|7|8|9|네|다섯|여섯|일곱|여덟|아홉)\s*층.{0,20}(?:전시관|전시실)/u.test(
    text,
  );
}

function isMountainOrTrail(name: string, text: string) {
  if (/동산|모노레일|케이블카|전망대|공원|박물관|미술관|휴양림|수목원|생태숲|출렁다리|안내소/u.test(name)) {
    return /둘레길|트레킹\s*코스|등산로/u.test(name);
  }
  const namedMountain = /(?:산|봉|오름)(?:\s|$|\()/u.test(name);
  const routeSignal = /산행|등산(?:로|코스)?|종주|트레킹|탐방로|정상(?:까지|에)\s*(?:오르|걷)|(?:오르|걸).{0,15}정상/u.test(text);
  return (namedMountain && routeSignal) || /둘레길|트레킹\s*코스|등산로/u.test(name);
}

function firstSentence(value: string) {
  return value.split(/[.!?。]/u, 1)[0] ?? "";
}

function isPalaceComplex(name: string, text: string) {
  return /(?:궁|궁궐)(?:\s|$|\()/u.test(name) && /전각|궁궐|정전|왕실/u.test(text);
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
