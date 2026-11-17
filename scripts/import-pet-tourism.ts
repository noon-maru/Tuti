import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePetTourArtifact } from "../src/server/tourism/petTourArtifact";
import type { PetSource } from "../src/server/tourism/petTourClient";

let disconnect: (() => Promise<void>) | undefined;
let completedRecords = 0, matched = 0, unmatched = 0;
try {
  const args = process.argv.slice(2), path = args.shift();
  if (!path?.endsWith(".jsonl")) throw new Error("JSONL_PATH_REQUIRED");
  let source: PetSource = "kor", expectedHash: string | undefined, apply = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error("DUPLICATE_FLAG");
    seen.add(flag);
    if (flag === "--apply") apply = true;
    else if (flag === "--source" && ["kor", "pet"].includes(args[index + 1])) source = args[++index] as PetSource;
    else if (flag === "--expected-sha256" && /^[a-f0-9]{64}$/.test(args[index + 1] ?? "")) expectedHash = args[++index];
    else throw new Error("INVALID_ARGUMENT");
  }
  const stat = await lstat(resolve(path));
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error("INVALID_ARTIFACT_FILE");
  const artifact = parsePetTourArtifact(await readFile(resolve(path), "utf8"), source);
  if (expectedHash && artifact.sha256 !== expectedHash) throw new Error("ARTIFACT_HASH_MISMATCH");
  if (apply && !expectedHash) throw new Error("APPLY_REQUIRES_EXPECTED_HASH");
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "file-validation-only", source, records: artifact.records.length, officialListings: artifact.officialListings, sha256: artifact.sha256, networkRequests: 0, databaseChanged: false }));
  if (apply) {
    const { prisma } = await import("../src/server/db/prisma");
    disconnect = () => prisma.$disconnect();
    const { savePetTourism } = await import("../src/server/tourism/savePetTourism");
    for (let start = 0; start < artifact.records.length; start += 100) {
      const result = await savePetTourism(artifact.records.slice(start, start + 100));
      completedRecords += result.processed; matched += result.matched; unmatched += result.unmatched;
    }
    console.log(JSON.stringify({ mode: "applied", source, completedRecords, matched, unmatched, sha256: artifact.sha256, automaticPlaceApproval: false, reviewedConditionsChanged: false }));
  }
} catch {
  console.error(JSON.stringify({ status: "failed", completedRecords, matched, unmatched, message: "입력 파일·해시·마이그레이션·DB 연결을 확인해주세요.", privateDetailsSuppressed: true }));
  process.exitCode = 1;
} finally { await disconnect?.(); }
