import { prisma } from "@/server/db/prisma";
import { assessDogDestination } from "@/server/recommendations/dogDestination";
import type { OutingQuality } from "@/shared/api/outingQuality";
import { TOUR_API_PET_FRESHNESS_MS } from "@/shared/pets/tourApiDogAccess";

export async function readOutingQuality(now = new Date()): Promise<OutingQuality> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const result: OutingQuality = { asOf: now.toISOString(), registered: 0, ready: 0, destinations: 0, regions: [], types: [], issues: [] };
    const regions = new Map<string, { name: string; ready: number; destinations: number }>();
    const types = new Map<string, number>();
    const issue = (kind: string, row: { id: string; name: string }, region: string) => {
      let group = result.issues.find(item => item.kind === kind);
      if (!group) { group = { kind, count: 0, samples: [] }; result.issues.push(group); }
      group.count++; if (group.samples.length < 10) group.samples.push({ id: row.id, name: row.name, region });
    };
    let cursor: string | undefined;
    for (;;) {
      const rows = await tx.place.findMany({ where: { dogCatalog: { isNot: null } }, orderBy: { id: "asc" }, take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: {
          id: true, name: true, image: true, source: true, sourceContentType: true, sourceSidoName: true, sourceSigunguName: true,
          visibilityOverride: true, candidateOverride: true, dogCatalog: { select: { status: true } },
          dogAccess: { select: { allowed: true, validUntil: true, checkedAt: true } },
          petSources: { where: { source: "kor" }, select: { fetchedAt: true } },
          tourismSourceRecord: { select: { rawPayload: true, detailRecord: { select: { overview: true } } } },
        } });
      if (!rows.length) break;
      for (const row of rows) {
        result.registered++;
        const region = [row.sourceSidoName, row.sourceSigunguName].filter(Boolean).join(" ") || "지역 미확인";
        if (row.dogCatalog?.status !== "ready" || row.visibilityOverride === "hide" || row.candidateOverride === "exclude" || row.source !== "tourapi") {
          if (row.dogCatalog?.status === "review_required") issue("카탈로그 검토 필요", row, region);
          continue;
        }
        result.ready++;
        const area = regions.get(region) ?? { name: region, ready: 0, destinations: 0 }; area.ready++; regions.set(region, area);
        const overview = row.tourismSourceRecord?.detailRecord?.overview;
        const destination = assessDogDestination({ name: row.name, sourceContentType: row.sourceContentType ?? undefined,
          phrase: "", note: "", moodTags: [], overview, basicPayload: row.tourismSourceRecord?.rawPayload });
        if (destination.eligible && row.sourceContentType !== "32" && !/폐업|영구\s*폐쇄|운영\s*종료/.test(`${row.name} ${overview ?? ""}`)) {
          result.destinations++; area.destinations++; types.set(destination.type, (types.get(destination.type) ?? 0) + 1);
        }
        if (!overview?.trim()) issue("소개 원문 누락", row, region);
        if (!row.image?.trim()) issue("대표 사진 없음", row, region);
        if (row.dogAccess) {
          if (!row.dogAccess.allowed) issue("별도 검토 동반 불가", row, region);
          else if (row.dogAccess.validUntil <= now || row.dogAccess.checkedAt > now) issue("동반 검토 정보 기간 확인", row, region);
        } else {
          const official = row.petSources[0];
          if (!official) issue("동반 원문 연결 없음", row, region);
          else if (official.fetchedAt > now || now.getTime() - official.fetchedAt.getTime() >= TOUR_API_PET_FRESHNESS_MS) issue("공식 동반 자료 재확인", row, region);
          else issue("공식 등록 · 방문 전 조건 확인", row, region);
        }
      }
      cursor = rows[rows.length - 1].id;
    }
    result.regions = [...regions.values()].sort((a, b) => a.destinations - b.destinations || a.name.localeCompare(b.name, "ko"));
    result.types = [...types].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    return result;
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
