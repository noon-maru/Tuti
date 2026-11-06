import { prisma } from "@/server/db/prisma";
import { sensitiveJournalPolicyEnabled } from "@/server/journal/sensitivePolicy";
import { distinctPlaceSuggestions, normalizePlaceQuery, placeNameIdentity, type JournalPlaceSuggestion } from "@/shared/api/placeSuggestions";
import { toPublicPlaceName, toPublicRegionLabel } from "./publicPlaceLabels";

type PreviousPlace = { name: string; placeId: string | null };

export async function suggestJournalPlaces(ownerId: string, value: string) {
  const query = normalizePlaceQuery(value);
  const pattern = `%${placeNameIdentity(query).replace(/[\\%_]/gu, "\\$&")}%`;
  return prisma.$transaction(async tx => {
    // 본문·사진·좌표는 조회하지 않으며 마디 ID도 반환하지 않는다.
    const previous = await tx.$queryRaw<PreviousPlace[]>`
      SELECT name, "placeId" FROM (
        SELECT DISTINCT ON (lower(regexp_replace(btrim(place_name), '[[:space:]]+', '', 'g')))
          place_name AS name, place_id AS "placeId", updated_at, id
        FROM journal_entries
        WHERE owner_id = ${ownerId} AND sensitive_withdrawn_at IS NULL
          AND (sensitive_content = false OR (${!sensitiveJournalPolicyEnabled()} AND sensitive_content IS NULL))
          AND btrim(place_name) <> '' AND place_name <> '남긴 공간'
          AND lower(regexp_replace(place_name, '[[:space:]]+', '', 'g')) ILIKE ${pattern}
        ORDER BY lower(regexp_replace(btrim(place_name), '[[:space:]]+', '', 'g')), updated_at DESC, id DESC
      ) recent ORDER BY updated_at DESC, id DESC LIMIT 5`;
    const linkedIds = previous.flatMap(row => row.placeId ? [row.placeId] : []);
    const linked = linkedIds.length ? await tx.place.findMany({ where: { id: { in: linkedIds }, isActive: true, reviewStatus: "approved" },
      select: { id: true, sourceSidoName: true, sourceSigunguName: true } }) : [];
    const history: JournalPlaceSuggestion[] = previous.map(row => {
      const place = linked.find(place => place.id === row.placeId);
      return { key: `history:${placeNameIdentity(row.name)}`, source: "history", id: place?.id ?? null, name: row.name,
        region: place ? toPublicRegionLabel(place.sourceSidoName, place.sourceSigunguName) : null };
    });
    const matches = query ? await tx.place.findMany({ where: { isActive: true, reviewStatus: "approved", OR: [
      { name: { contains: query, mode: "insensitive" } }, { sourceAddress: { contains: query, mode: "insensitive" } },
      { sourceSidoName: { contains: query, mode: "insensitive" } }, { sourceSigunguName: { contains: query, mode: "insensitive" } },
    ] }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 8, select: { id: true, name: true, sourceSidoName: true, sourceSigunguName: true } }) : [];
    return distinctPlaceSuggestions(history, matches.map(place => ({ key: `place:${place.id}`, source: "place", id: place.id,
      name: toPublicPlaceName(place.name, place.sourceSidoName, place.sourceSigunguName), region: toPublicRegionLabel(place.sourceSidoName, place.sourceSigunguName) })));
  }, { isolationLevel: "RepeatableRead" });
}
