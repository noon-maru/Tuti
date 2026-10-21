import { readFile } from "node:fs/promises";
import { compareCoreRestore } from "../src/server/legal/coreRestoreComparison";

async function main() {
  if (process.argv.length !== 2) throw new Error("FIXED_SANDBOX_PATHS_ONLY");
  const source = JSON.parse(await readFile("/evidence/core-source.json", "utf8"));
  const restored = JSON.parse(await readFile("/evidence/core-restored.json", "utf8"));
  const policy = (await readFile("/sandbox-policy/excluded.txt", "utf8")).trim().split("\n");
  console.log(JSON.stringify(compareCoreRestore(source, restored, policy)));
}
main().catch(() => { console.error('{"stage":"core-round-trip-comparison","status":"failed","privateDetailsSuppressed":true}'); process.exitCode = 1; });
