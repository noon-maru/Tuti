import { prisma } from "../src/server/db/prisma";
import { maintainRightsCases, sendRightsDeadlineAlert } from "../src/server/legal/journalRights";
import { recordRightsMaintenanceSuccess } from "../src/server/legal/operations";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("지원하는 옵션은 --apply뿐입니다. 기본은 조회 전용입니다.");
  const apply = args.includes("--apply");
  const result = await maintainRightsCases(apply);
  const alert = apply ? await sendRightsDeadlineAlert() : { enabled: Boolean(process.env.LEGAL_RIGHTS_ALERT_WEBHOOK_URL), alerted: 0 };
  if (apply) await recordRightsMaintenanceSuccess();
  console.log(JSON.stringify({ ...result, alert }));
}
main().catch(() => { console.error("권리 침해 기한 점검에 실패했습니다. 설정과 DB 상태를 확인해주세요."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
