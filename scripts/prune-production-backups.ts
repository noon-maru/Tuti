import { planBackupRetention, applyBackupRetention } from "../src/server/legal/backupRetention";
import { prunePrivacyReplayLedger } from "../src/server/legal/privacyReplayLedger";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--days="))) throw new Error("지원하는 옵션은 --days=30 [--apply]입니다.");
  const days = Number(args.find((arg) => arg.startsWith("--days="))?.slice(7) ?? 30);
  // 두 경로의 계획이 성공하기 전에는 삭제하지 않는다. 핵심 경로 누락도 안전하게 중단한다.
  const now = new Date();
  const plan = await planBackupRetention("/backup-retention", days, now, "full");
  const corePlan = await planBackupRetention("/core-backup-retention", days, now, "core");
  const deleted = args.includes("--apply") ? await applyBackupRetention("/backup-retention", plan) : 0;
  const coreDeleted = args.includes("--apply") ? await applyBackupRetention("/core-backup-retention", corePlan) : 0;
  // 알 수 없는 보관 디렉터리가 있으면 원장을 먼저 파기하지 않고 운영 확인으로 남긴다.
  const skipped = plan.skipped + corePlan.skipped;
  const ledger = args.includes("--apply") && skipped === 0 ? await prunePrivacyReplayLedger(new Date(plan.cutoff)) : { enabled: false, deleted: 0 };
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "applied" : "dry-run", ...plan, deleted, core: { ...corePlan, deleted: coreDeleted }, ledger, ledgerReviewRequired: skipped > 0 }));
  if (args.includes("--apply") && skipped > 0) process.exitCode = 2;
}
main().catch(() => { console.error("백업 보관기간 점검·파기에 실패했습니다. 전용 경로와 백업 manifest를 확인해주세요."); process.exitCode = 1; });
