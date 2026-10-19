import { prisma } from "../src/server/db/prisma";
import { initializePrivacyReplayLedger, privacyReplayEnabled, readPrivacyReplaySnapshot } from "../src/server/legal/privacyReplayLedger";
import { replayPrivacyRequests, settleCurrentPrivacyRequests } from "../src/server/legal/privacyReplay";
import { cleanupPrivacyReplayObjects } from "../src/server/legal/privacyReplayObjects";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--cleanup-objects") && args.every((arg) => ["--cleanup-objects", "--apply"].includes(arg))) {
    if (!privacyReplayEnabled()) { console.log(JSON.stringify({ enabled: false })); return; }
    if (args.includes("--apply") && process.env.TUTI_PRIVACY_REPLAY_OFFLINE !== "true") throw new Error("유지보수 잠금과 앱 중지 확인이 필요합니다.");
    console.log(JSON.stringify(await cleanupPrivacyReplayObjects(args.includes("--apply"))));
    return;
  }
  if (args.length === 1 && args[0] === "--mode") { console.log(privacyReplayEnabled() ? "enabled" : "disabled"); return; }
  if (args.length === 1 && args[0] === "--settle-current") {
    if (process.env.TUTI_PRIVACY_REPLAY_OFFLINE !== "true") throw new Error("DB 복원 전 오프라인 상태에서만 확인할 수 있습니다.");
    const result = await settleCurrentPrivacyRequests();
    console.log(JSON.stringify(result));
    if (result.unresolved) process.exitCode = 2;
    return;
  }
  if (args.length === 1 && args[0] === "--status") {
    if (!privacyReplayEnabled()) { console.log(JSON.stringify({ enabled: false })); return; }
    const snapshot = await readPrivacyReplaySnapshot();
    console.log(JSON.stringify({ enabled: true, coverageStart: snapshot.coverageStart.toISOString(), committed: snapshot.committed.length, unresolved: snapshot.unresolved }));
    return;
  }
  if (args.length === 1 && args[0] === "--init") {
    const header = await initializePrivacyReplayLedger();
    console.log(JSON.stringify({ initialized: true, coverageStart: header.coverageStart }));
    return;
  }
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--backup-at=") && !arg.startsWith("--legacy-review="))) throw new Error("허용되지 않은 옵션입니다.");
  const backup = args.find((arg) => arg.startsWith("--backup-at="))?.slice(12);
  if (!backup) throw new Error("백업 manifest의 실제 created_at을 --backup-at=ISO8601로 지정해주세요.");
  if (args.includes("--apply") && process.env.TUTI_PRIVACY_REPLAY_OFFLINE !== "true") throw new Error("운영 앱 중지와 유지보수 잠금을 확인한 오프라인 복원 경로에서만 적용할 수 있습니다.");
  const legacyReviewReference = args.find((arg) => arg.startsWith("--legacy-review="))?.slice(16);
  if (legacyReviewReference !== undefined && !/^[A-Za-z0-9_-]{3,100}$/.test(legacyReviewReference)) throw new Error("기존 백업 재정리 검토 근거 번호를 확인해주세요.");
  console.log(JSON.stringify(await replayPrivacyRequests(new Date(backup), args.includes("--apply"), legacyReviewReference)));
}
main().catch(() => { console.error("복원 후 삭제·철회 재반영을 완료하지 못했습니다. 원장·미완료 요청·백업 시점과 객체 삭제 결과를 확인해주세요. 서비스 재개를 보류합니다."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
