import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { enablePrivacyLedgerEnvironment } from "../src/server/legal/privacyRuntimeConfig";

// 운영 전환 도구만 사용한다. 임의 경로·키 생성·다른 기능 플래그 수정은 허용하지 않는다.
try {
  if (process.getuid?.() !== 0 || process.argv.length !== 2) throw new Error("운영 전용 실행 조건이 필요합니다.");
  const target = "/runtime-config/.env.production";
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  let original: string;
  let owner: { uid: number; gid: number };
  let revision: { ino: number; size: number; mtimeMs: number };
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error("환경 파일 형식 확인 필요");
    original = await handle.readFile("utf8");
    owner = { uid: info.uid, gid: info.gid };
    revision = { ino: info.ino, size: info.size, mtimeMs: info.mtimeMs };
  } finally { await handle.close(); }
  const updated = enablePrivacyLedgerEnvironment(original);
  const temporary = `/runtime-config/.privacy-enable-${randomUUID()}.tmp`;
  try {
    const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await output.chown(owner.uid, owner.gid); await output.writeFile(updated); await output.sync(); }
    finally { await output.close(); }
    const current = await lstat(target);
    if (!current.isFile() || current.isSymbolicLink() || current.ino !== revision.ino || current.size !== revision.size || current.mtimeMs !== revision.mtimeMs) throw new Error("환경 파일 변경 확인 필요");
    await rename(temporary, target);
    const directory = await open("/runtime-config", constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  console.log("PRIVACY_REPLAY_LEDGER_ENABLED=true 설정 완료. 다른 플래그는 변경하지 않았습니다.");
} catch {
  console.error("원장 활성화 환경 설정에 실패했습니다. 환경 파일 내용·비밀키를 출력하지 말고 점검해주세요.");
  process.exitCode = 1;
}
