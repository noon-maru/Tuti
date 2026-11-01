// Passed as fixed source to docker exec; no new image, bind mount or container is needed.
import { spawn } from "node:child_process";
import { existsSync, realpathSync, statSync, writeFileSync, unlinkSync } from "node:fs";
const [mode, ...args] = process.argv.slice(1);
const runId = process.env.TUTI_OPS_RUN_ID ?? "";
const cleanup = mode === "backup-cleanup" && args.length === 0;
const objects = ["backup-check", "backup-objects"].includes(mode) && args.length === 2 &&
  ["full", "core"].includes(args[0]) && /^[0-9]{8}-[0-9]{6}$/.test(args[1]);
if (!/^[a-f0-9-]{36}$/.test(runId) || !(cleanup || objects)) {
  console.error("허용되지 않은 백업 작업입니다."); process.exit(1);
}
let destination;
if (objects) {
  destination = `${args[0] === "full" ? "/backup-retention" : "/core-backup-retention"}/.${args[1]}.partial`;
  try {
    if (realpathSync(destination) !== destination || !statSync(destination).isDirectory()) throw new Error();
  } catch { console.error("백업 전용 마운트의 임시 디렉터리를 확인하지 못했습니다."); process.exit(1); }
}
if (mode === "backup-check") {
  console.log('{"backupWorkerReady":true,"ephemeralContainersCreated":false}'); process.exit(0);
}
const file = `/tmp/tuti-ops-${runId}.json`, cancelled = `${file}.cancel`;
function removeOwnFiles() {
  for (const path of [file, cancelled]) { try { unlinkSync(path); } catch { /* Only this run's files. */ } }
}
if (existsSync(cancelled)) { removeOwnFiles(); process.exit(143); }
writeFileSync(file, JSON.stringify({ pid: process.pid, runId }), { flag: "wx", mode: 0o600 });
if (existsSync(cancelled)) { removeOwnFiles(); process.exit(143); }
const task = cleanup ? ["scripts/privacy-replay.ts", "--cleanup-objects", "--apply"]
  : ["scripts/backup-object-storage.ts", destination];
const child = spawn("node_modules/.bin/tsx", task, { detached: true, stdio: ["ignore", "inherit", "inherit"] });
let exitOverride, killTimer;
function signalGroup(signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
}
function stop(code) {
  if (exitOverride !== undefined) return;
  exitOverride = code; signalGroup("SIGTERM");
  killTimer = setTimeout(() => signalGroup("SIGKILL"), 10_000);
}
process.on("SIGTERM", () => stop(143));
process.on("SIGINT", () => stop(130));
process.on("SIGHUP", () => stop(129));
const deadline = setTimeout(() => stop(124), cleanup ? 240_000 : 1_200_000);
child.on("error", () => { console.error("백업 자식 작업을 시작하지 못했습니다."); exitOverride = 1; });
child.on("close", (code, signal) => {
  clearTimeout(deadline); clearTimeout(killTimer); removeOwnFiles();
  process.exit(exitOverride ?? (signal ? 1 : code ?? 1));
});
