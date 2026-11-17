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
  const closedOnChosenDate = Boolean(answers.longDistanceTiming && detail?.restDate && isRestDay(detail.restDate, date));
  return { ...place, ...(detail?.admissionFee ? { admissionFee: detail.admissionFee } : {}),
    ...(fit ? { executionFeasibility: { ...fit, operationStatus: closedOnChosenDate ? "closed_today" as const : "unknown" as const,
      fitStatus: closedOnChosenDate ? "impossible" as const : fit.fitStatus, fitsAvailableTime: !closedOnChosenDate && fit.fitsAvailableTime } } : {}) };
}

export function fitsDogTimeBudget(place: TutiPlace) {
  return place.executionFeasibility?.fitStatus !== "impossible";
}
