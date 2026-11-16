import { placeMadiPath } from "./placeMadiPath";

/** A navigation intention, never evidence of a visit. Old/unowned state stays hidden. */
export function pendingMadiPath(pending: { ownerId?: string; harumadiId?: string; placeId: string; placeName: string; journeyId: string; startedAt: string; promptAfter: string } | undefined, ownerId: string, now: number) {
  if (!pending || pending.ownerId !== ownerId) return null;
  const started = Date.parse(pending.startedAt), after = Date.parse(pending.promptAfter);
  if (!Number.isFinite(started) || !Number.isFinite(after) || started > now || after > now || after < started || now - started > 7 * 86400_000) return null;
  return placeMadiPath({ id: pending.placeId, name: pending.placeName }, pending.journeyId, pending.harumadiId);
}
