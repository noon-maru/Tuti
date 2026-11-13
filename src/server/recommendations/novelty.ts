import { prisma } from "@/server/db/prisma";
import type { TutiPlace } from "@/lib/recommendations";

export type PlaceNoveltySignal = { placeId: string; exposures: number; recorded: boolean; familiar: boolean };
export function noveltyBoost(signal?: Omit<PlaceNoveltySignal, "placeId">) {
  if (signal?.familiar || signal?.recorded) return 0;
  const count = signal?.exposures ?? 0;
  return count === 0 ? 6 : count === 1 ? 4 : count <= 3 ? 2 : 0;
}

export function rankWithNovelty(places: readonly TutiPlace[], signals: readonly PlaceNoveltySignal[] | null): TutiPlace[] {
  if (signals === null) return [...places];
  const byPlace = new Map(signals.map(signal => [signal.placeId, signal]));
  return places.map((place, index) => ({ place: { ...place, noveltyBoost: noveltyBoost(byPlace.get(place.id)) }, index }))
    .sort((a, b) => noveltyRankingScore(a.place) - noveltyRankingScore(b.place) || a.index - b.index)
    .map(({ place }) => place);
}

export function noveltyRankingScore(place: TutiPlace) {
  // 기존 점수는 이동·피로 비용이므로 작을수록 앞선다. 원래 점수를 덮어쓰지 않는다.
  const bonus = Math.max(0, Math.min(6, place.noveltyBoost ?? 0));
  return (place.rankingScore ?? place.fatigueScore ?? place.fatigue) - bonus;
}

export async function loadPlaceNoveltySignals(userId: string | undefined, placeIds: string[], now: Date, database = prisma): Promise<PlaceNoveltySignal[] | null> {
  const ids = [...new Set(placeIds)];
  if (!userId || !ids.length) return null;
  const exposureSince = new Date(now.getTime() - 30 * 86400_000);
  const recordSince = new Date(now.getTime() - 180 * 86400_000);
  try {
    return await database.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '100ms'");
      return tx.$queryRaw<PlaceNoveltySignal[]>`
        WITH exposure AS (
          SELECT place_id, count(DISTINCT journey_id)::integer AS exposures
          FROM recommendation_actions WHERE user_id=${userId} AND place_id=ANY(${ids}::text[])
            AND action IN ('recommendation_shown','place_selected') AND created_at>=${exposureSince}
          GROUP BY place_id
        ), recorded AS (
          SELECT DISTINCT place_id FROM journal_entries WHERE owner_id=${userId}
            AND place_id=ANY(${ids}::text[]) AND sensitive_withdrawn_at IS NULL AND created_at>=${recordSince}
        ), familiar AS (
          SELECT place_id FROM place_familiarities WHERE user_id=${userId} AND place_id=ANY(${ids}::text[]) AND expires_at>${now}
        ), touched AS (SELECT place_id FROM exposure UNION SELECT place_id FROM recorded UNION SELECT place_id FROM familiar)
        SELECT t.place_id AS "placeId", coalesce(e.exposures,0) AS exposures,
          (r.place_id IS NOT NULL) AS recorded, (f.place_id IS NOT NULL) AS familiar
        FROM touched t LEFT JOIN exposure e USING(place_id) LEFT JOIN recorded r USING(place_id) LEFT JOIN familiar f USING(place_id)
      `;
    }, { maxWait: 100, timeout: 1_000 });
  } catch {
    // 이력 조회 실패나 마이그레이션 전에도 일반 추천은 중단하지 않는다.
    return null;
  }
}
