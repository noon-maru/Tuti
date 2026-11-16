import { mkdir, open, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { collectPetTourism } from "../src/server/tourism/collectPetTourism";
import { TourApiError } from "../src/server/tourism/tourApiClient";
import type { PetSource } from "../src/server/tourism/petTourClient";

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const accepted = new Set(["--source", "--start-page", "--pages", "--rows", "--max-requests", "--output", "--apply"]);
for (let i = 0; i < args.length; i++) { if (!accepted.has(args[i])) throw new Error("INVALID_ARGUMENT"); if (args[i] !== "--apply") { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("MISSING_ARGUMENT"); i++; } }
const source = value("--source", "both");
if (!["kor", "pet", "both"].includes(source)) throw new Error("INVALID_SOURCE");
const output = resolve(value("--output", join(".tourism-data", "pet-tourism", new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomUUID().slice(0, 8))));
const sources: PetSource[] = source === "both" ? ["kor", "pet"] : [source as PetSource];
let disconnect: (() => Promise<void>) | undefined;
try {
  // Exclusive artifact directory: reruns never overwrite another collection/checkpoint.
  await mkdir(output, { recursive: true, mode: 0o700 });
  if ((await lstat(output)).isSymbolicLink()) throw new Error("OUTPUT_SYMLINK");
  for (const source of sources) {
    const artifact = await open(join(output, `${source}.jsonl`), "wx", 0o600);
    let progress: Awaited<ReturnType<typeof open>> | undefined;
    try {
      progress = await open(join(output, `${source}-progress.jsonl`), "wx", 0o600);
      const save = args.includes("--apply") ? (await import("../src/server/tourism/savePetTourism")).savePetTourism : undefined;
      if (save) { const { prisma } = await import("../src/server/db/prisma"); disconnect = () => prisma.$disconnect(); }
      const result = await collectPetTourism({ source, startPage: Number(value("--start-page", "1")), pages: Number(value("--pages", "1")), rows: Number(value("--rows", "10")), maxRequests: Number(value("--max-requests", "200")) }, async (records, checkpoint) => {
        await artifact.writeFile(records.map(row => JSON.stringify(row)).join("\n") + (records.length ? "\n" : "")); await artifact.sync();
        if (save) await save(records);
        await progress!.writeFile(JSON.stringify(checkpoint) + "\n"); await progress!.sync();
      });
      console.log(JSON.stringify({ ...result, mode: save ? "database-and-artifact" : "artifact-only", output, credentialsPrinted: false, automaticEligibilityPublished: false }));
    } finally { await artifact.close(); await progress?.close(); }
  }
} catch (error) {
  console.error(JSON.stringify({ status: "failed", code: error instanceof TourApiError ? error.code : "COLLECTION_FAILED", rawResponseSuppressed: true }));
  process.exitCode = 1;
} finally {
  await disconnect?.();
}
