// A bounded process group per exec: cancelling a systemd job must not leave DB writers behind.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
const tasks = {
  rights: "scripts/maintain-journal-rights.ts",
  privacy: "scripts/maintain-privacy-data.ts",
  recovery: "scripts/privacy-ledger-recovery.ts",
  retention: "scripts/prune-production-backups.ts",
};
const [mode, ...args] = process.argv.slice(2);
const runId = process.env.TUTI_OPS_RUN_ID ?? "";
if (!/^[a-f0-9-]{36}$/.test(runId) || !Object.hasOwn(tasks, mode) ||
    args.length > 1 || (args.length && args[0] !== "--apply")) {
  console.error("지원하지 않는 운영 작업입니다."); process.exit(1);
}
const file = join("/tmp", `tuti-ops-${runId}.json`);
const cancelled = `${file}.cancel`;
function removeOwnFiles() {
  for (const path of [file, cancelled]) { try { unlinkSync(path); } catch { /* A late cancel marker is harmless and private. */ } }
}
if (existsSync(cancelled)) { removeOwnFiles(); process.exit(143); }
writeFileSync(file, JSON.stringify({ pid: process.pid, runId }), { flag: "wx", mode: 0o600 });
if (existsSync(cancelled)) { removeOwnFiles(); process.exit(143); }
const taskArgs = mode === "recovery" ? [args.length ? "--snapshot" : "--verify"]
  : mode === "retention" ? ["--days=30", ...args] : args;
let exitOverride;
let killTimer;
const child = spawn("node_modules/.bin/tsx", [tasks[mode], ...taskArgs], {
  detached: true, stdio: ["ignore", "inherit", "inherit"],
});
function signalGroup(signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
}
function stop(code) {
  if (exitOverride !== undefined) return;
  exitOverride = code;
  signalGroup("SIGTERM");
  killTimer = setTimeout(() => signalGroup("SIGKILL"), 10_000);
}
process.on("SIGTERM", () => stop(143));
process.on("SIGINT", () => stop(130));
process.on("SIGHUP", () => stop(129));
const deadline = setTimeout(() => stop(124), 240_000);
child.on("error", () => { console.error("운영 작업을 시작하지 못했습니다."); exitOverride = 1; });
child.on("close", (code, signal) => {
  clearTimeout(deadline); clearTimeout(killTimer);
  removeOwnFiles();
  process.exit(exitOverride ?? (signal ? 1 : code ?? 1));
});
