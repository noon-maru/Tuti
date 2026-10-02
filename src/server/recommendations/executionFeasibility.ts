import type {
  ExecutionFeasibility,
  PlaceVisitTimeProfile,
  TutiPlace,
} from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { getDefaultStayDuration } from "@/server/recommendations/placeVisitTimeProfile";
import { movementTimeBudget } from "@/shared/tuti/movementTimeBudget";
import type { IntakeAnswers } from "@/shared/tuti/types";

const KOREA_TIME_ZONE = "Asia/Seoul";
export type OperationDetail = {
  openingHours: string | null;
  restDate: string | null;
  admissionFee: string | null;
};

export async function enrichPlacesWithAdmissionFees(places: TutiPlace[]) {
  if (places.length === 0) return places;
  const sources = await prisma.tourismPlaceSourceRecord.findMany({
    where: { linkedPlaceId: { in: places.map((place) => place.id) } },
    select: {
      linkedPlaceId: true,
      detailRecord: { select: { admissionFee: true } },
    },
  });
  const feeByPlaceId = new Map(
    sources.flatMap((source) => {
      const admissionFee = source.detailRecord?.admissionFee?.trim();
      return source.linkedPlaceId && admissionFee
        ? [[source.linkedPlaceId, admissionFee] as const]
        : [];
    }),
  );
  return places.map((place) => {
    const admissionFee = feeByPlaceId.get(place.id);
    return admissionFee ? { ...place, admissionFee } : place;
  });
}

export async function enrichPlacesWithExecutionFeasibility(
  places: TutiPlace[],
  answers: IntakeAnswers,
  now = new Date(),
) {
  const placeIds = places.map((place) => place.id);
  if (placeIds.length === 0) return places;

  const sources = await prisma.tourismPlaceSourceRecord.findMany({
    where: { linkedPlaceId: { in: placeIds } },
    select: {
      linkedPlaceId: true,
      detailRecord: {
        select: {
          openingHours: true,
          restDate: true,
          admissionFee: true,
        },
      },
    },
  });
  const detailByPlaceId = new Map(
    sources.flatMap((source) =>
      source.linkedPlaceId && source.detailRecord
        ? [[source.linkedPlaceId, source.detailRecord] as const]
        : [],
    ),
  );

  return enrichPlacesWithKnownExecutionFeasibility(
    places,
    answers,
    detailByPlaceId,
    now,
  );
}

export function enrichPlacesWithKnownExecutionFeasibility(
  places: TutiPlace[],
  answers: IntakeAnswers,
  detailByPlaceId: ReadonlyMap<string, OperationDetail>,
  now = new Date(),
) {
  return places.map((place) => {
    const detail = detailByPlaceId.get(place.id);
    const executionFeasibility = calculateExecutionFeasibility({
      place,
      answers,
      detail,
      now,
    });
    const admissionFee = detail?.admissionFee?.trim();
    return {
      ...place,
      ...(admissionFee ? { admissionFee } : {}),
      ...(executionFeasibility ? { executionFeasibility } : {}),
    };
  });
}

export function calculateExecutionFeasibility({
  place,
  answers,
  detail,
  now = new Date(),
}: {
  place: TutiPlace;
  answers: IntakeAnswers;
  detail?: OperationDetail;
  now?: Date;
}): ExecutionFeasibility | null {
  const travelSeconds = place.travelTimeSummary?.durationSeconds;
  const movement = answers.movement ?? "short";
  const availableMinutes = movementTimeBudget[movement].minutes;
  const travelTimeVerified = Boolean(travelSeconds);
  const estimatedOneWayMinutes = travelSeconds
    ? null
    : estimateOneWayMinutes(place.distanceMeters, answers.transport);
  const travelTimeEstimated = estimatedOneWayMinutes !== null;
  const oneWayMinutes = travelSeconds
    ? Math.max(1, Math.ceil(travelSeconds / 60))
    : estimatedOneWayMinutes ?? 0;
  const roundTripMinutes = oneWayMinutes * 2;
  const visitProfile = place.visitTimeProfile ?? createFallbackVisitProfile(place);
  const minimumStayMinutes = visitProfile.stayMinimumMinutes;
  const typicalStayMinutes = visitProfile.stayTypicalMinutes;
  const maximumStayMinutes = visitProfile.stayMaximumMinutes;
  const minimumBufferMinutes = getVisitBufferMinutes(
    visitProfile,
    answers.transport,
    "minimum",
  );
  const typicalBufferMinutes = getVisitBufferMinutes(
    visitProfile,
    answers.transport,
    "typical",
  );
  const maximumBufferMinutes = getVisitBufferMinutes(
    visitProfile,
    answers.transport,
    "maximum",
  );
  const initialArrival = new Date(now.getTime() + oneWayMinutes * 60_000);
  const operation = resolveOperationWindow(detail, initialArrival);
  const waitingMinutes = operation.opensAt && initialArrival < operation.opensAt
    ? Math.ceil((operation.opensAt.getTime() - initialArrival.getTime()) / 60_000)
    : 0;
  const minimumTotalMinutes =
    roundTripMinutes + waitingMinutes + minimumBufferMinutes + minimumStayMinutes;
  const typicalTotalMinutes =
    roundTripMinutes + waitingMinutes + typicalBufferMinutes + typicalStayMinutes;
  const maximumTotalMinutes =
    roundTripMinutes + waitingMinutes + maximumBufferMinutes + maximumStayMinutes;
  const typicalLeaveAt = new Date(
    initialArrival.getTime() +
      (waitingMinutes + typicalBufferMinutes + typicalStayMinutes) * 60_000,
  );
  const useTypicalVisit =
    typicalTotalMinutes <= availableMinutes &&
    (!operation.closesAt || typicalLeaveAt <= operation.closesAt);
  const recommendedStayMinutes = useTypicalVisit
    ? typicalStayMinutes
    : minimumStayMinutes;
  const selectedBufferMinutes = useTypicalVisit
    ? typicalBufferMinutes
    : minimumBufferMinutes;
  const arrivalAt = new Date(
    initialArrival.getTime() + (waitingMinutes + selectedBufferMinutes) * 60_000,
  );
  const leaveAt = new Date(arrivalAt.getTime() + recommendedStayMinutes * 60_000);
  const returnAt = new Date(leaveAt.getTime() + oneWayMinutes * 60_000);
  const totalMinutes =
    roundTripMinutes + waitingMinutes + selectedBufferMinutes + recommendedStayMinutes;
  const operationStatus = resolveOperationStatus({
    detail,
    operation,
    initialArrival,
    leaveAt,
  });
  const explicitlyUnavailable =
    answers.transport === "car" &&
    visitProfile.carSuitability === "unavailable";
  const fitStatus = resolveFitStatus({
    availableMinutes,
    minimumTotalMinutes,
    typicalTotalMinutes,
    hasTravelEstimate: travelTimeVerified || travelTimeEstimated,
    explicitlyUnavailable:
      explicitlyUnavailable ||
      operationStatus === "closed_today" ||
      operationStatus === "closes_too_soon",
  });

  return {
    travelTimeVerified,
    travelTimeEstimated,
    availableMinutes,
    oneWayMinutes,
    roundTripMinutes,
    minimumStayMinutes,
    typicalStayMinutes,
    maximumStayMinutes,
    recommendedStayMinutes,
    minimumBufferMinutes,
    typicalBufferMinutes,
    maximumBufferMinutes,
    waitingMinutes,
    totalMinutes,
    minimumTotalMinutes,
    typicalTotalMinutes,
    maximumTotalMinutes,
    fitStatus,
    fitsAvailableTime: fitStatus !== "impossible",
    operationStatus,
    arrivalAt: arrivalAt.toISOString(),
    leaveAt: leaveAt.toISOString(),
    returnAt: returnAt.toISOString(),
  };
}

function createFallbackVisitProfile(
  place: Pick<TutiPlace, "sourceContentType" | "experienceType">,
): PlaceVisitTimeProfile {
  const stay = getDefaultStayDuration({
    contentTypeId: place.sourceContentType,
    experienceType: place.experienceType,
  });
  return {
    stayMinimumMinutes: stay.minimumMinutes,
    stayTypicalMinutes: stay.typicalMinutes,
    stayMaximumMinutes: stay.maximumMinutes,
    staySource: "type_default",
    stayFlexibility: "flexible",
    parkingAvailability: "unknown",
    carSuitability: "possible",
    entryProcess: "open",
    reservationRequirement: "none",
    accessConstraint: "none",
    parkingBufferMinimumMinutes: 10,
    parkingBufferTypicalMinutes: 20,
    parkingBufferMaximumMinutes: 30,
    entryBufferMinimumMinutes: 0,
    entryBufferTypicalMinutes: 5,
    entryBufferMaximumMinutes: 10,
    confidence: 40,
    profileVersion: "runtime-fallback-v1",
  };
}

function getVisitBufferMinutes(
  profile: PlaceVisitTimeProfile,
  transport: IntakeAnswers["transport"],
  range: "minimum" | "typical" | "maximum",
) {
  const entry = range === "minimum"
    ? profile.entryBufferMinimumMinutes
    : range === "typical"
      ? profile.entryBufferTypicalMinutes
      : profile.entryBufferMaximumMinutes;
  const parking = transport !== "car"
    ? 0
    : range === "minimum"
      ? profile.parkingBufferMinimumMinutes
      : range === "typical"
        ? profile.parkingBufferTypicalMinutes
        : profile.parkingBufferMaximumMinutes;
  return entry + parking;
}

function estimateOneWayMinutes(
  distanceMeters: number | undefined,
  transport: IntakeAnswers["transport"],
) {
  if (!distanceMeters || distanceMeters <= 0) return null;
  if (transport === "car") {
    const roadDistanceMeters = distanceMeters * 1.25;
    return Math.max(3, Math.ceil(roadDistanceMeters / 580) + 2);
  }
  const routeDistanceMeters = distanceMeters * 1.35;
  return Math.max(8, Math.ceil(routeDistanceMeters / 300) + 5);
}

function resolveFitStatus({
  availableMinutes,
  minimumTotalMinutes,
  typicalTotalMinutes,
  hasTravelEstimate,
  explicitlyUnavailable,
}: {
  availableMinutes: number;
  minimumTotalMinutes: number;
  typicalTotalMinutes: number;
  hasTravelEstimate: boolean;
  explicitlyUnavailable: boolean;
}): NonNullable<ExecutionFeasibility["fitStatus"]> {
  if (explicitlyUnavailable || minimumTotalMinutes > availableMinutes) {
    return "impossible";
  }
  if (!hasTravelEstimate) return "unknown";
  if (typicalTotalMinutes <= availableMinutes * 0.85) return "comfortable";
  if (typicalTotalMinutes <= availableMinutes) return "possible";
  return "tight";
}

function resolveOperationWindow(
  detail: OperationDetail | undefined,
  arrival: Date,
) {
  const openingHours = detail?.openingHours?.replace(/\s+/g, " ").trim();
  if (!openingHours) return { opensAt: null, closesAt: null };
  if (/24\s*시간|상시\s*개방|상시개방/.test(openingHours)) {
    return {
      opensAt: startOfKoreanDate(arrival),
      closesAt: endOfKoreanDate(arrival),
    };
  }

  const range = parseTimeRange(openingHours);
  if (!range) return { opensAt: null, closesAt: null };
  return {
    opensAt: atKoreanMinutes(arrival, range.startMinutes),
    closesAt: atKoreanMinutes(arrival, range.endMinutes),
  };
}

function resolveOperationStatus({
  detail,
  operation,
  initialArrival,
  leaveAt,
}: {
  detail: OperationDetail | undefined;
  operation: { opensAt: Date | null; closesAt: Date | null };
  initialArrival: Date;
  leaveAt: Date;
}): ExecutionFeasibility["operationStatus"] {
  if (detail?.restDate && isRestDay(detail.restDate, initialArrival)) {
    return "closed_today";
  }
  if (!operation.opensAt || !operation.closesAt) return "unknown";
  if (initialArrival < operation.opensAt) {
    return leaveAt <= operation.closesAt ? "opens_later" : "closes_too_soon";
  }
  if (initialArrival >= operation.closesAt || leaveAt > operation.closesAt) {
    return "closes_too_soon";
  }
  return "available";
}

function parseTimeRange(value: string) {
  const match = value.match(
    /(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2})?\s*분?)?\s*(?:~|～|\-|–|—|부터)\s*(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2})?\s*분?)?/,
  );
  if (!match) return null;
  const startMinutes = toMinutes(match[1], match[2], match[3]);
  let endMinutes = toMinutes(match[4], match[5], match[6]);
  if (startMinutes === null || endMinutes === null) return null;
  if (endMinutes === 0 && /24\s*:?\s*00/.test(value)) endMinutes = 24 * 60;
  if (endMinutes <= startMinutes) return null;
  return { startMinutes, endMinutes };
}

function toMinutes(
  meridiem: string | undefined,
  hourValue: string,
  minuteValue: string | undefined,
) {
  let hour = Number(hourValue);
  const minute = Number(minuteValue ?? 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) {
    return null;
  }
  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;
  if (hour > 24 || (hour === 24 && minute > 0)) return null;
  return hour * 60 + minute;
}

function isRestDay(restDate: string, date: Date) {
  if (/연중\s*무휴|연중무휴|없음/.test(restDate)) return false;
  const parts = getKoreanDateParts(date);
  if (
    new RegExp(`${parts.month}\\s*월\\s*0?${parts.day}\\s*일`).test(restDate)
  ) {
    return true;
  }
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parts.weekday];
  if (!weekday || !mentionsWeekday(restDate, weekday)) return false;

  const mentionedWeeks = ["첫째", "둘째", "셋째", "넷째", "다섯째"]
    .map((label, index) => (restDate.includes(label) ? index + 1 : null))
    .filter((week): week is number => week !== null);
  return (
    mentionedWeeks.length === 0 ||
    mentionedWeeks.includes(Math.ceil(parts.day / 7))
  );
}

function mentionsWeekday(text: string, weekday: string) {
  return (
    text.includes(`${weekday}요일`) ||
    new RegExp(`(^|[\\s,·/()])${weekday}(?=$|[\\s,·/()])`).test(text)
  );
}

function getKoreanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      value("weekday"),
    ),
  };
}

function atKoreanMinutes(date: Date, minutes: number) {
  const parts = getKoreanDateParts(date);
  if (minutes === 24 * 60) {
    const start = new Date(
      `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T00:00:00+09:00`,
    );
    return new Date(start.getTime() + 24 * 60 * 60_000);
  }
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(
    `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  );
}

function startOfKoreanDate(date: Date) {
  return atKoreanMinutes(date, 0);
}

function endOfKoreanDate(date: Date) {
  return new Date(startOfKoreanDate(date).getTime() + 24 * 60 * 60_000);
}
