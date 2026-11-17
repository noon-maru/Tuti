import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchPetTourPage } from "../src/server/tourism/petTourClient";
import { petContentId } from "../src/server/tourism/petTourRecord";
import { TourApiError } from "../src/server/tourism/tourApiClient";

// Supplementary basic metadata only. Never replaces the Korean companion-condition source.
const args = process.argv.slice(2), seen = new Set<string>();
const option = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
let received = 0, nextPage = 1;
try {
  for (let i = 0; i < args.length; i += 2) { if (!["--pages", "--start-page", "--output"].includes(args[i]) || seen.has(args[i]) || !args[i + 1]) throw Error("INVALID_ARGUMENT"); seen.add(args[i]); }
  const pages = Number(option("--pages", "1")), startPage = Number(option("--start-page", "1"));
  if (![pages, startPage].every(n => Number.isSafeInteger(n) && n > 0) || pages > 1000) throw Error("INVALID_LIMIT");
  nextPage = startPage;
  const output = resolve(option("--output", `.tourism-data/dog-basics/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}.jsonl`));
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const file = await open(output, "wx", 0o600);
  const ids = new Set<string>();
  try {
    await file.chmod(0o600);
    for (let pageNo = startPage; pageNo < startPage + pages; pageNo++) {
      const page = await fetchPetTourPage("pet", pageNo, 100);
      if (page.pageNo !== pageNo || !Number.isSafeInteger(page.totalCount) || page.totalCount < 0 || page.items.length > 100 || (page.items.length < 100 && pageNo * 100 < page.totalCount)) throw Error("INVALID_PAGE");
      const records = page.items.map(item => {
        const contentId = petContentId(item);
        if (!contentId || ids.has(contentId)) throw Error("INVALID_OR_DUPLICATE_ID");
        ids.add(contentId);
        return { source: "pet-list", contentId, fetchedAt: new Date().toISOString(), item };
      });
      await file.writeFile(records.map(row => JSON.stringify(row)).join("\n") + (records.length ? "\n" : "")); await file.sync();
      received += records.length; nextPage = pageNo + 1;
      const complete = pageNo * 100 >= page.totalCount;
      if (complete || pageNo % 10 === 0) console.log(JSON.stringify({ operation: "basic-metadata-only", received, nextPage, totalAvailable: page.totalCount, complete, output }));
      if (complete) break;
    }
    console.log(JSON.stringify({ mode: "artifact-only", received, nextPage, output, databaseChanged: false }));
  } finally { await file.close(); }
} catch (error) {
  console.error(JSON.stringify({ status: "failed", received, nextPage, code: error instanceof TourApiError ? error.code : "BASIC_COLLECTION_FAILED", rawResponseSuppressed: true })); process.exitCode = 1;
}
