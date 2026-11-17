import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/server/db/prisma";
import { readablePlaceWhere } from "../src/server/recommendations/dogPlaceWhere";
import { editorialBackfillSelection, editorialSource, editorialSourceFingerprint } from "../src/server/tourism/placeEditorialBackfill";
import { createPlaceOverviewSummaryFingerprint } from "../src/server/tourism/placeOverviewSummary";

// Public place records only. No user data, external API calls or database writes.
const directoryIndex = process.argv.indexOf("--export");
const directory = directoryIndex >= 0 ? process.argv[directoryIndex + 1] : undefined;
if (directoryIndex >= 0 && !directory) throw new Error("--export 저장 경로가 필요합니다.");
try {
  const rows = await prisma.place.findMany({ where: readablePlaceWhere, select: editorialBackfillSelection, orderBy: { id: "asc" } });
  const missing = rows.filter(row => !row.suggestedAction?.trim() || !row.tourismSourceRecord?.detailRecord?.overviewSummary?.trim());
  const supported = missing.filter(row => editorialSource(row).overview);
  const stale = rows.filter(row => {
    const detail = row.tourismSourceRecord?.detailRecord;
    return detail?.overviewSummary?.trim() && detail.summarySourceFingerprint !== createPlaceOverviewSummaryFingerprint(detail);
  });
  if (directory) {
    mkdirSync(resolve(directory), { recursive: true });
    for (const [index, label] of ["a", "b", "c"].entries()) {
      const batch = supported.filter((_row, position) => position % 3 === index).map(row => ({ ...editorialSource(row), sourceFingerprint: editorialSourceFingerprint(row) }));
      writeFileSync(resolve(directory, `${label}.jsonl`), batch.map(row => JSON.stringify(row)).join("\n") + "\n");
      const reviews = stale.filter((_row, position) => position % 3 === index).map(row => ({ ...editorialSource(row),
        existingSummary: row.tourismSourceRecord!.detailRecord!.overviewSummary, sourceFingerprint: editorialSourceFingerprint(row) }));
      writeFileSync(resolve(directory, `stale-${label}.jsonl`), reviews.map(row => JSON.stringify(row)).join("\n") + "\n");
    }
    writeFileSync(resolve(directory, "unsupported.jsonl"), missing.filter(row => !editorialSource(row).overview).map(row => JSON.stringify({ contentId: row.sourceId, name: row.name, type: row.sourceContentType, reason: "NO_OVERVIEW_SOURCE" })).join("\n") + "\n");
  }
  console.log(JSON.stringify({ scope: "development-readable-places", total: rows.length, missing: missing.length, supported: supported.length, withoutOverview: missing.length - supported.length, staleExistingSummaries: stale.length, exported: Boolean(directory), databaseChanged: false }));
} finally { await prisma.$disconnect(); }
