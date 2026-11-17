import type { TutiPlace } from "@/lib/recommendations";
import type { IntakeAnswers } from "@/shared/tuti/types";
import { calculateExecutionFeasibility, isRestDay, type OperationDetail } from "./executionFeasibility";

export function dogVisitDate(answers: IntakeAnswers, now: Date) {
  return new Date(now.getTime() + (answers.longDistanceTiming === "tomorrow_day_trip" ? 86400000 : 0));
}
/** Discovery is not 'depart now'. Do not spend the time budget waiting for a shop to open. */
export function dogFeasibility(place: TutiPlace, answers: IntakeAnswers, detail: OperationDetail | undefined, now: Date) {
  const date = dogVisitDate(answers, now);
  const fit = calculateExecutionFeasibility({ place, answers, now: date, detail: detail ? { ...detail, openingHours: null, restDate: null } : undefined });
  // Conditional/rotating holidays cannot be interpreted as every matching weekday.
  const rest = detail?.restDate ?? "";
  const ambiguousRest = /마지막|격주|공휴일|명절|문의|변동|주차|둘째|넷째|첫째|셋째|다섯째/.test(rest);
  const closedOnChosenDate = Boolean(answers.longDistanceTiming && rest && !ambiguousRest && isRestDay(rest, date));
  return { ...place, ...(detail?.admissionFee ? { admissionFee: detail.admissionFee } : {}),
    ...(fit ? { executionFeasibility: { ...fit, operationStatus: closedOnChosenDate ? "closed_today" as const : "unknown" as const,
      fitStatus: closedOnChosenDate ? "impossible" as const : fit.fitStatus, fitsAvailableTime: !closedOnChosenDate && fit.fitsAvailableTime } } : {}) };
}

export function fitsDogTimeBudget(place: TutiPlace) {
  return place.executionFeasibility?.fitStatus !== "impossible";
}
