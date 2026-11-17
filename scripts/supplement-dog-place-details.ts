import { mkdir, open, readFile, lstat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "../src/server/db/prisma";
import { fetchTourApiPage } from "../src/server/tourism/tourApiClient";
import type { TourApiDetailItem } from "../src/server/tourism/tourApiDetailClient";
import { supplementDogPlaceDetail, type DogDetailSupplement } from "../src/server/tourism/supplementDogPlaceDetail";
import { registerDogPlace } from "../src/server/tourism/registerDogPlace";

try {
  const args = process.argv.slice(2);
  if (args[0] === "--collect" && args.length === 2) {
    const ids = args[1].split(",");
    if (ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !/^\d{1,20}$/.test(id))) throw Error("INVALID_IDS");
    const path = resolve(`.tourism-data/dog-details/${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const records: DogDetailSupplement[] = [];
    let calls = 0;
    for (const contentId of ids) {
      const parameters = { contentId, pageNo: "1", numOfRows: "100" };
      const common = (await fetchTourApiPage<TourApiDetailItem>("detailCommon2", parameters)).items[0] ?? null; calls++;
      if (!common) { console.log(JSON.stringify({ contentId, status: "provider_record_missing" })); continue; }
      if (common.contentid !== contentId) throw Error("CONTENT_ID_MISMATCH");
      const contentTypeId = typeof common.contenttypeid === "string" ? common.contenttypeid : null;
      const intro = contentTypeId ? (await fetchTourApiPage<TourApiDetailItem>("detailIntro2", { ...parameters, contentTypeId })).items[0] ?? null : null;
      if (contentTypeId) calls++;
      let images: TourApiDetailItem[] = [];
      if (!common.firstimage && !common.firstimage2) { images = (await fetchTourApiPage<TourApiDetailItem>("detailImage2", parameters)).items; calls++; }
      records.push({ contentId, fetchedAt: new Date().toISOString(), payload: { common, intro, images, info: [] } });
    }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const file = await open(path, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(records)); await file.sync(); } finally { await file.close(); }
    console.log(JSON.stringify({ mode: "public-artifact-only", records: records.length, calls, path, databaseChanged: false }));
  } else {
    const path = args.shift();
    if (!path?.endsWith(".json") || args.some((arg, i) => arg !== "--apply" && arg !== "--register-basics" && arg !== "--expected-sha256" && args[i-1] !== "--expected-sha256")) throw Error("INVALID_ARGUMENT");
    const stat = await lstat(path); if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw Error("INVALID_FILE");
    const text = await readFile(path, "utf8"), hash = createHash("sha256").update(text).digest("hex");
    const expected = args[args.indexOf("--expected-sha256") + 1];
    if (args.includes("--apply") && (!args.includes("--expected-sha256") || expected !== hash)) throw Error("HASH_REQUIRED");
    const records: DogDetailSupplement[] = JSON.parse(text);
    if (!Array.isArray(records) || records.length > 20 || new Set(records.map(r => r.contentId)).size !== records.length) throw Error("INVALID_RECORDS");
    // Validate the entire input before any DB mutation.
    for (const r of records) if (!/^\d{1,20}$/.test(r.contentId) || r.payload?.common?.contentid !== r.contentId || !Array.isArray(r.payload.images) || !Array.isArray(r.payload.info) || !Number.isFinite(Date.parse(r.fetchedAt)) || Date.parse(r.fetchedAt) > Date.now()) throw Error("INVALID_SOURCE");
    console.log(JSON.stringify({ mode: args.includes("--apply") ? "apply" : "dry-run", sha256: hash, records: records.length }));
    for (const record of records) {
      if (args.includes("--register-basics")) console.log(JSON.stringify({ contentId: record.contentId, basic: await registerDogPlace(record.contentId, { source: "kor-common", contentId: record.contentId, fetchedAt: record.fetchedAt, item: record.payload.common! }, args.includes("--apply"), true) }));
      console.log(JSON.stringify(await supplementDogPlaceDetail(record, args.includes("--apply"))));
    }
  }
} catch { console.error(JSON.stringify({ status: "failed", privateDetailsSuppressed: true })); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
