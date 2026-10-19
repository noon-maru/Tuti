import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rmdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type PrivacyReplayKind = "account_deleted" | "location_withdrawn" | "journal_deleted" | "journal_book_deleted" | "journal_unpublished";
type Receipt = { version: 1; id: string; kind: PrivacyReplayKind; subject: string; target: string | null; phase: "prepared" | "committed"; preparedAt: string; effectiveAt: string | null };
type Header = { version: 1; type: "privacy-replay"; coverageStart: string; keyCheck: string; receiptIds: string[]; retiringIds: string[] };
export type PrivacyReplaySnapshot = { coverageStart: Date; committed: Receipt[]; unresolved: number; pending?: Receipt[] };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const iso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const privacyReplayEnabled = () => process.env.PRIVACY_REPLAY_LEDGER_ENABLED === "true";

export class PrivacyReplayError extends Error {
  constructor(message = "삭제·철회 복원 방지 원장을 확인하지 못했습니다.") { super(message); }
}
function config() {
  const directory = process.env.PRIVACY_REPLAY_LEDGER_PATH ?? "/run/tuti/privacy-ledger";
  const secret = process.env.PRIVACY_REPLAY_HMAC_SECRET ?? "";
  if (!isAbsolute(directory) || directory.split("/").filter(Boolean).length < 2 || !/^[a-f0-9]{64}$/i.test(secret)) throw new PrivacyReplayError("복원 방지 원장 경로와 전용 32바이트 키 설정이 필요합니다.");
  return { directory, secret };
}
function signature(payload: string, secret: string) { return createHmac("sha256", Buffer.from(secret, "hex")).update(payload).digest("hex"); }
export function privacyReplaySubject(userId: string) { return signature(`subject:${userId}`, config().secret); }
export function privacyReplayTarget(entity: "journal" | "book", id: string) { return signature(`target:${entity}:${id}`, config().secret); }
async function directoryCheck(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new PrivacyReplayError("원장은 전용 0700 디렉터리에 보관해야 합니다.");
}
async function syncDirectory(directory: string) { const handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }
async function withLedgerLock<T>(operation: () => Promise<T>) {
  const { directory } = config();
  await directoryCheck(directory);
  const lock = join(directory, ".lock");
  let acquired = false;
  // NAS에서는 서명 파일과 디렉터리 fsync가 느릴 수 있다. 동시 요청이 정상
  // 완료될 시간을 주되, 비정상 종료 잠금을 삭제하거나 무한 대기하지 않는다.
  for (let attempt = 0; attempt < 300; attempt++) {
    try { await mkdir(lock, { mode: 0o700 }); acquired = true; break; }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
    await delay(50);
  }
  if (!acquired) throw new PrivacyReplayError("원장이 사용 중이거나 비정상 종료 잠금이 남아 있습니다. 잠금을 임의 삭제하지 말고 운영 점검이 필요합니다.");
  try { return await operation(); } finally { await rmdir(lock); }
}
async function writeSigned(path: string, data: unknown, secret: string) {
  const payload = JSON.stringify(data);
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    // Root 운영 작업도 앱 전용 디렉터리 소유자를 유지한다.
    if (process.getuid?.() === 0) { const owner = await lstat(config().directory); await handle.chown(owner.uid, owner.gid); }
    await handle.writeFile(JSON.stringify({ payload, signature: signature(payload, secret) })); await handle.sync();
  }
  finally { await handle.close(); }
}
async function replaceSigned(filename: string, data: unknown) {
  const { directory, secret } = config();
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  await writeSigned(temporary, data, secret);
  await rename(temporary, join(directory, filename));
  await syncDirectory(directory);
}
async function readSigned(path: string, secret: string): Promise<Record<string, unknown>> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024 || (stat.mode & 0o077) !== 0) throw new PrivacyReplayError();
    const envelope: unknown = JSON.parse(await handle.readFile("utf8"));
    if (!envelope || typeof envelope !== "object") throw new PrivacyReplayError();
    const { payload, signature: claimed } = envelope as Record<string, unknown>;
    if (typeof payload !== "string" || typeof claimed !== "string" || !DIGEST.test(claimed) || !timingSafeEqual(Buffer.from(claimed, "hex"), Buffer.from(signature(payload, secret), "hex"))) throw new PrivacyReplayError("복원 방지 원장의 무결성 확인에 실패했습니다.");
    const value: unknown = JSON.parse(payload);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrivacyReplayError();
    return value as Record<string, unknown>;
  } finally { await handle.close(); }
}
async function readHeader() {
  const { directory, secret } = config();
  await directoryCheck(directory);
  const value = await readSigned(join(directory, "ledger.json"), secret);
  if (value.version !== 1 || value.type !== "privacy-replay" || !iso(value.coverageStart) || value.keyCheck !== signature("key-check", secret) || !Array.isArray(value.receiptIds) || !Array.isArray(value.retiringIds) || [...value.receiptIds, ...value.retiringIds].some((id: unknown) => typeof id !== "string" || !UUID.test(id)) || new Set([...value.receiptIds, ...value.retiringIds]).size !== value.receiptIds.length + value.retiringIds.length) throw new PrivacyReplayError("원장 초기화 시점·키·처리 목록을 확인해주세요. 임의 키 교체는 허용되지 않습니다.");
  return value as unknown as Header;
}
export async function initializePrivacyReplayLedger(now = new Date()) {
  const { directory, secret } = config();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await directoryCheck(directory);
  return withLedgerLock(async () => {
    try {
      await writeSigned(join(directory, "ledger.json"), { version: 1, type: "privacy-replay", coverageStart: now.toISOString(), keyCheck: signature("key-check", secret), receiptIds: [], retiringIds: [] }, secret);
      await syncDirectory(directory);
    } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
    return readHeader();
  });
}
export async function preparePrivacyReplayReceipt(kind: PrivacyReplayKind, userId: string, now = new Date(), targetId?: string) {
  if (!privacyReplayEnabled()) return null;
  const requiresTarget = kind.startsWith("journal_");
  if (requiresTarget !== Boolean(targetId) || targetId && targetId.length > 200) throw new PrivacyReplayError("삭제·공개 중지 대상 식별값을 확인해주세요.");
  return withLedgerLock(async () => {
    const header = await readHeader(); // API는 누락된 원장을 조용히 새로 만들지 않는다.
    const { directory, secret } = config();
    const receipt: Receipt = { version: 1, id: randomUUID(), kind, subject: privacyReplaySubject(userId), target: targetId ? privacyReplayTarget(kind === "journal_book_deleted" ? "book" : "journal", targetId) : null, phase: "prepared", preparedAt: now.toISOString(), effectiveAt: null };
    await writeSigned(join(directory, `${receipt.id}.json`), receipt, secret);
    await syncDirectory(directory);
    await replaceSigned("ledger.json", { ...header, receiptIds: [...header.receiptIds, receipt.id] });
    return receipt;
  });
}
export async function commitPrivacyReplayReceipt(receipt: Receipt | null, effectiveAt = new Date()) {
  if (!receipt) return;
  await withLedgerLock(async () => {
    const { directory, secret } = config();
    if (!UUID.test(receipt.id)) throw new PrivacyReplayError();
    const existing = await readSigned(join(directory, `${receipt.id}.json`), secret);
    if (existing.subject !== receipt.subject || existing.kind !== receipt.kind || existing.target !== receipt.target || existing.preparedAt !== receipt.preparedAt || existing.phase !== "prepared") throw new PrivacyReplayError();
    const data: Receipt = { ...receipt, phase: "committed", effectiveAt: new Date(Math.max(effectiveAt.getTime(), Date.parse(receipt.preparedAt))).toISOString() };
    await replaceSigned(`${receipt.id}.json`, data);
  });
}
function parseReceipt(value: Record<string, unknown>, filename: string): Receipt {
  if (value.version !== 1 || typeof value.id !== "string" || !UUID.test(value.id) || filename !== `${value.id}.json` || typeof value.subject !== "string" || !DIGEST.test(value.subject) || !["account_deleted", "location_withdrawn", "journal_deleted", "journal_book_deleted", "journal_unpublished"].includes(String(value.kind)) || (String(value.kind).startsWith("journal_") ? typeof value.target !== "string" || !DIGEST.test(value.target) : value.target !== null) || !["prepared", "committed"].includes(String(value.phase)) || !iso(value.preparedAt) || (value.phase === "prepared" ? value.effectiveAt !== null : !iso(value.effectiveAt) || Date.parse(value.effectiveAt) < Date.parse(value.preparedAt))) throw new PrivacyReplayError("유효하지 않은 원장 기록이 있습니다. 자동 복원 재개를 중지합니다.");
  return value as unknown as Receipt;
}
export async function readPrivacyReplaySnapshot(): Promise<PrivacyReplaySnapshot> {
  return withLedgerLock(async () => {
  const header = await readHeader();
  const { directory, secret } = config();
  const records: Receipt[] = [];
  for (const name of await readdir(directory)) {
    if (name === ".lock" || name === "ledger.json" || /^\.[a-f0-9-]+\.tmp$/.test(name)) continue;
    if (header.retiringIds.includes(name.slice(0, -5)) && name.endsWith(".json")) continue;
    if (!name.endsWith(".json") || !UUID.test(name.slice(0, -5))) throw new PrivacyReplayError("원장 디렉터리에 알 수 없는 파일이 있습니다.");
    records.push(parseReceipt(await readSigned(join(directory, name), secret), name));
  }
  if (records.length !== header.receiptIds.length || records.some((record) => !header.receiptIds.includes(record.id))) throw new PrivacyReplayError("원장의 처리 기록이 누락되었거나 불완전합니다.");
  const committed = records.filter((record) => record.phase === "committed");
  const pending = records.filter((record) => record.phase === "prepared" && !committed.some((later) => later.subject === record.subject && (later.kind === "account_deleted" || later.kind === record.kind && later.target === record.target && later.preparedAt >= record.preparedAt)));
  return { coverageStart: new Date(header.coverageStart), committed, unresolved: pending.length, pending };
  });
}
// 백업 파기 도구가 동일한 cutoff의 만료 백업 정리를 마친 다음에만 호출한다.
// 미완료 요청은 지우지 않고, 기준일 이전 백업은 이후 자동 재개 대상에서 제외한다.
export async function prunePrivacyReplayLedger(cutoff: Date) {
  if (!privacyReplayEnabled()) return { enabled: false, deleted: 0 };
  if (!Number.isFinite(cutoff.getTime()) || cutoff.getTime() > Date.now() - 30 * 86400000) throw new PrivacyReplayError("원장 파기는 확정한 30일 보관 범위 이후에만 가능합니다.");
  return withLedgerLock(async () => {
    const header = await readHeader();
    const { directory, secret } = config();
    const retiring = [...header.retiringIds];
    const kept: string[] = [];
    const allowed = new Set(["ledger.json", ".lock", ...[...header.receiptIds, ...header.retiringIds].map((id) => `${id}.json`)]);
    for (const name of await readdir(directory)) if (!allowed.has(name) && !/^\.[a-f0-9-]+\.tmp$/.test(name)) throw new PrivacyReplayError("원장에 미확인 파일이 있어 파기를 보류합니다.");
    const records = await Promise.all(header.receiptIds.map(async (id) => parseReceipt(await readSigned(join(directory, `${id}.json`), secret), `${id}.json`)));
    for (const id of header.receiptIds) {
      const record = records.find((item) => item.id === id)!;
      const superseded = record.phase === "prepared" && new Date(record.preparedAt) < cutoff && records.some((later) => later.phase === "committed" && later.subject === record.subject && (later.kind === "account_deleted" || later.kind === record.kind && later.target === record.target && later.preparedAt >= record.preparedAt));
      if (record.phase === "committed" && record.effectiveAt && new Date(record.effectiveAt) < cutoff || superseded) retiring.push(id);
      else kept.push(id);
    }
    const next = { ...header, coverageStart: new Date(Math.max(Date.parse(header.coverageStart), cutoff.getTime())).toISOString(), receiptIds: kept, retiringIds: retiring };
    await replaceSigned("ledger.json", next);
    for (const id of retiring) {
      try { await unlink(join(directory, `${id}.json`)); }
      catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    }
    await syncDirectory(directory);
    await replaceSigned("ledger.json", { ...next, retiringIds: [] });
    let temporaryFilesDeleted = 0;
    // 모든 원장 쓰기는 이 잠금 안에서 끝난다. 지금 남아 있는 고유 임시 파일은
    // 권위 있는 원장이 아니므로, 강제 종료 때 남은 검증값 사본도 정리한다.
    for (const name of await readdir(directory)) {
      if (name.startsWith(".") && name.endsWith(".tmp") && UUID.test(name.slice(1, -4))) {
        await unlink(join(directory, name));
        temporaryFilesDeleted++;
      }
    }
    await syncDirectory(directory);
    return { enabled: true, deleted: retiring.length, temporaryFilesDeleted };
  });
}
export function verifyPrivacyReplayCoverage(snapshot: PrivacyReplaySnapshot, backupAt: Date, legacyReviewReference?: string) {
  if (!Number.isFinite(backupAt.getTime())) throw new PrivacyReplayError("백업 생성 시각을 확인해주세요.");
  if (backupAt < snapshot.coverageStart && (!legacyReviewReference || !/^[A-Za-z0-9_-]{3,100}$/.test(legacyReviewReference))) throw new PrivacyReplayError("원장 수집 시작 이전 백업입니다. 별도 재정리 검토 없이 자동 재개할 수 없습니다.");
  if (snapshot.unresolved) throw new PrivacyReplayError("완료 여부를 확인하지 못한 삭제·철회 요청이 있습니다. 운영자 확인이 필요합니다.");
}
