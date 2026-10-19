import { prisma } from "../src/server/db/prisma";
import { purgeWithdrawnLocationSubject } from "../src/server/location/compliance";

async function main() {
  const arguments_ = process.argv.slice(2);
  const apply = arguments_.includes("--apply");
  const afterIndex = arguments_.indexOf("--after-user-id");
  const after = afterIndex >= 0 ? arguments_[afterIndex + 1] : "";
  if (after === undefined || (after && !/^[a-zA-Z0-9_-]{1,80}$/.test(after))) throw new Error("페이지 시작 사용자 식별값을 확인해주세요.");
  const candidates = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT latest.user_id FROM (
      SELECT DISTINCT ON (user_id) user_id, status
      FROM location_consent_events WHERE user_id IS NOT NULL AND user_id > ${after}
      ORDER BY user_id, created_at DESC, id DESC
    ) latest JOIN users ON users.id = latest.user_id
    WHERE latest.status = 'withdrawn' ORDER BY latest.user_id LIMIT 501
  `;
  const page = candidates.slice(0, 500);
  const summary = { users: 0, skipped: 0, usageLogs: 0, consentEvents: 0, recommendationRuns: 0, routeMetadata: 0 };
  for (const candidate of page) {
    const result = await purgeWithdrawnLocationSubject(candidate.user_id, apply);
    summary.users += 1;
    summary.skipped += Number(result.skipped);
    summary.usageLogs += result.usageLogs;
    summary.consentEvents += result.consentEvents;
    summary.recommendationRuns += result.recommendationRuns ?? 0;
    summary.routeMetadata += result.routeMetadata ?? 0;
  }
  console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", ...summary, hasMore: candidates.length > 500, nextAfterUserId: candidates.length > 500 ? page.at(-1)?.user_id : null }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "철회 자료 정리에 실패했습니다."); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
