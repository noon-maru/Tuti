import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { capturePrivacyReplayRecovery, readPrivacyReplaySnapshot } from "./privacyReplayLedger";

const RECEIPT_FILE = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/;
async function privateDirectory(root: string) {
  await mkdir(root, { mode: 0o700, recursive: true });
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new Error("전용 복구 경로 권한을 확인해주세요.");
}

// 키를 포함한다. 접근 가능한 운영자만 별도 안전한 보관소로 옮길 수 있으며 로그에 출력하지 않는다.
async function cleanupRecoveryScratch(root: string) {
  // 고정 래퍼의 전용 잠금 아래, 강제 종료로 남은 비권위 임시 사본만 정리한다.
  for (const name of await readdir(root)) {
    const temporaryFile = /^\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.tmp$/.test(name);
    const temporaryDirectory = /^\.verify-[A-Za-z0-9]{6}$/.test(name);
    if (!temporaryFile && !temporaryDirectory) continue;
    const path = join(root, name);
    const info = await lstat(path);
    if (info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || (temporaryFile ? !info.isFile() : !info.isDirectory())) throw new Error("임시 복구 사본 권한 확인 필요");
    if (temporaryFile) await unlink(path); else await rm(path, { recursive: true });
  }
}
export async function savePrivacyReplayRecovery(root: string) {
  await privateDirectory(root);
  const snapshot = await capturePrivacyReplayRecovery();
  const contents = JSON.stringify(snapshot);
  if (Buffer.byteLength(contents) > 64 * 1024 * 1024) throw new Error("복구 사본 크기 검토 필요");
  const temporary = join(root, `.${randomUUID()}.tmp`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(contents); await handle.sync(); }
  finally { await handle.close(); }
  let verified;
  try {
    verified = await verifyPrivateRecoveryFile(root, temporary);
    await rename(temporary, join(root, "latest.json"));
  } catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  const directory = await open(root, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await directory.sync(); } finally { await directory.close(); }
  // 정상 최신 사본을 확정하기 전에 남은 유일한 복구 후보를 지우지 않는다.
  await cleanupRecoveryScratch(root);
  return verified;
}

// 운영 원장을 덮어쓰지 않고 사본과 키를 별도 임시 폴더에 풀어 실제 서명 검사를 한다.
// 이 사본 이후 요청이 누락될 수 있으므로, 성공해도 자동 운영 복원/재개를 허용하지 않는다.
export async function verifyPrivacyReplayRecovery(root: string) {
  await privateDirectory(root);
  return verifyPrivateRecoveryFile(root, join(root, "latest.json"));
}
async function verifyPrivateRecoveryFile(root: string, filename: string) {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  let value: unknown;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size > 64 * 1024 * 1024) throw new Error("복구 사본 권한·크기를 확인해주세요.");
    value = JSON.parse(await handle.readFile("utf8"));
  } finally { await handle.close(); }
  const snapshot = value as { version?: unknown; capturedAt?: unknown; secret?: unknown; files?: unknown };
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.capturedAt !== "string" || !Number.isFinite(Date.parse(snapshot.capturedAt)) || typeof snapshot.secret !== "string" || !/^[a-f0-9]{64}$/i.test(snapshot.secret) || !snapshot.files || typeof snapshot.files !== "object" || Array.isArray(snapshot.files)) throw new Error("복구 사본 형식을 확인해주세요.");
  const files = Object.entries(snapshot.files);
  if (!files.some(([name]) => name === "ledger.json") || files.some(([name, content]) => name !== "ledger.json" && !RECEIPT_FILE.test(name) || typeof content !== "string")) throw new Error("복구 파일 목록을 확인해주세요.");
  const directory = await mkdtemp(join(root, ".verify-"));
  const previous = { path: process.env.PRIVACY_REPLAY_LEDGER_PATH, secret: process.env.PRIVACY_REPLAY_HMAC_SECRET };
  try {
    for (const [name, content] of files) await writeFile(join(directory, name), content as string, { mode: 0o600, flag: "wx" });
    process.env.PRIVACY_REPLAY_LEDGER_PATH = directory;
    process.env.PRIVACY_REPLAY_HMAC_SECRET = snapshot.secret;
    const observed = await readPrivacyReplaySnapshot();
    return { verified: true, capturedAt: snapshot.capturedAt, coverageStart: observed.coverageStart.toISOString(), committed: observed.committed.length, unresolved: observed.unresolved, automaticRestoreAllowed: false };
  } finally {
    for (const [name, saved] of Object.entries({ PRIVACY_REPLAY_LEDGER_PATH: previous.path, PRIVACY_REPLAY_HMAC_SECRET: previous.secret })) {
      if (saved === undefined) delete process.env[name]; else process.env[name] = saved;
    }
    await rm(directory, { recursive: true, force: true });
  }
}
