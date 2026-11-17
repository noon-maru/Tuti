import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { prisma } from "../src/server/db/prisma";
import { registerDogPlace } from "../src/server/tourism/registerDogPlace";
import { normalizeDogPlaceBasic, type DogPlaceBasicRecord } from "../src/server/tourism/dogPlaceBasic";

let completed = 0;
try {
  const args = process.argv.slice(2), path = args.shift();
  if (!path?.endsWith(".jsonl") || args.some((arg, i) => arg !== "--apply" && arg !== "--expected-sha256" && args[i - 1] !== "--expected-sha256")) throw Error("INVALID_ARGUMENT");
  if (new Set(args.filter(arg => arg.startsWith("--"))).size !== args.filter(arg => arg.startsWith("--")).length) throw Error("DUPLICATE_ARGUMENT");
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw Error("INVALID_FILE");
  const raw = await readFile(path, "utf8"), hash = createHash("sha256").update(raw).digest("hex");
  const expected = args.includes("--expected-sha256") ? args[args.indexOf("--expected-sha256") + 1] : undefined;
  if (args.includes("--apply") && !expected || expected && expected !== hash) throw Error("HASH_REQUIRED_OR_MISMATCH");
  const basics = new Map<string, DogPlaceBasicRecord>();
  for (const line of raw.trim().split("\n")) {
    const row = JSON.parse(line) as DogPlaceBasicRecord;
    if (row.source !== "pet-list" || !row.item || typeof row.item !== "object" || row.item.contentid !== row.contentId || !Number.isFinite(Date.parse(row.fetchedAt)) || Date.parse(row.fetchedAt) > Date.now() || basics.has(row.contentId)) throw Error("INVALID_BASIC_RECORD");
    basics.set(row.contentId, row);
  }
  const sources = await prisma.tourismPetSourceRecord.findMany({ where: { source: "kor" }, select: { contentId: true }, orderBy: { contentId: "asc" } });
  // Reuse already stored basic sources before supplementary API metadata.
  const cached = await prisma.tourismPlaceSourceRecord.findMany({ where: { contentId: { in: sources.map(s => s.contentId) } }, select: { contentId: true, rawPayload: true, syncedAt: true } });
  for (const row of cached) {
    const value: DogPlaceBasicRecord = { contentId: row.contentId, source: "kor-source", fetchedAt: row.syncedAt.toISOString(), item: row.rawPayload as Record<string, unknown> };
    if (normalizeDogPlaceBasic(value)) basics.set(row.contentId, value);
  }
  const counts: Record<string, number> = {};
  let created = 0;
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "apply-preflight" : "dry-run", sourceRecords: sources.length, basicRecords: basics.size, sha256: hash }));
  for (const row of sources) {
    const result = await registerDogPlace(row.contentId, basics.get(row.contentId) ?? null, args.includes("--apply"));
    counts[result.status] = (counts[result.status] ?? 0) + 1; if (result.created) created++; completed++;
    if (completed % 500 === 0) console.log(JSON.stringify({ completed, counts, created }));
  }
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "applied" : "dry-run", completed, counts, created, sha256: hash, legacyStatusesChanged: false }));
} catch { console.error(JSON.stringify({ status: "failed", completed, privateDetailsSuppressed: true })); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
