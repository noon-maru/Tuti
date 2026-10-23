import { createHash } from "node:crypto";
import { prisma } from "../src/server/db/prisma";
import { deleteEmptyOrdinaryAccount, deleteOrdinaryTestAccount } from "../src/server/admin/users";
import { privacyReplayEnabled, readPrivacyReplaySnapshot } from "../src/server/legal/privacyReplayLedger";

// 대상은 실제 조회가 끝난 과거 시점으로 고정한다. 새 계정은 자동 포함하지 않는다.
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const includeRecords = args.includes("--include-records");
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply" && args.filter(a => a === "--apply").length === 1) continue;
    if (args[i] === "--include-records" && args.filter(a => a === "--include-records").length === 1) continue;
    if (!["--created-before", "--expected-count", "--plan-hash"].includes(args[i]) || options.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("옵션을 확인해주세요.");
    options.set(args[i], args[++i]);
  }
  const cutoff = new Date(options.get("--created-before") ?? "");
  const expected = Number(options.get("--expected-count"));
  if (!Number.isFinite(cutoff.getTime()) || cutoff > new Date() || !options.has("--expected-count") || !Number.isInteger(expected) || expected < 1) throw new Error("과거 기준 시각과 승인된 대상 수가 필요합니다.");
  const candidates = await prisma.user.findMany({ where: {
    role: "user", createdAt: { lte: cutoff }, ...(!includeRecords ? { journalEntries: { none: {} }, journalBooks: { none: {} } } : {}),
  }, select: { id: true, journalEntries: { select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }, journalBooks: { select: { id: true, updatedAt: true }, orderBy: { id: "asc" } } }, orderBy: { id: "asc" } });
  const planHash = createHash("sha256").update(JSON.stringify({ cutoff: cutoff.toISOString(), ids: candidates.map(user => user.id), ...(includeRecords ? { recordsIncluded: true, snapshots: candidates } : {}) })).digest("hex");
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "dry-run", cutoff: cutoff.toISOString(), candidates: candidates.length, expected, planHash, administratorsIncluded: false, recordsIncluded: includeRecords,
    ...(includeRecords ? { journals: candidates.reduce((sum, user) => sum + user.journalEntries.length, 0), books: candidates.reduce((sum, user) => sum + user.journalBooks.length, 0), accounts: candidates.map(user => ({ id: user.id, journals: user.journalEntries.length, books: user.journalBooks.length })) } : {}),
  }));
  if (candidates.length !== expected) throw new Error("승인한 대상 수와 다릅니다. 삭제하지 않았습니다. 목록을 다시 확인해주세요.");
  if (!apply) return;
  if (options.get("--plan-hash") !== planHash) throw new Error("먼저 dry-run 결과의 planHash를 확인하고 동일한 해시로 실행해주세요. 삭제하지 않았습니다.");
  if (!privacyReplayEnabled()) throw new Error("삭제 원장이 활성화되어야 합니다.");
  if ((await readPrivacyReplaySnapshot()).unresolved) throw new Error("미완료 삭제·철회 기록을 먼저 확인해주세요.");
  let deleted = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    try {
      const result = includeRecords ? await deleteOrdinaryTestAccount(candidate.id, cutoff) : await deleteEmptyOrdinaryAccount(candidate.id, cutoff);
      if (result) deleted++; else skipped++;
      if ((deleted + skipped) % 25 === 0) console.log(JSON.stringify({ stage: "progress", deleted, skipped }));
    } catch {
      console.error(JSON.stringify({ stage: "stopped-on-error", deleted, skipped, remaining: candidates.length - deleted - skipped, reviewRequired: true }));
      throw new Error("일부 처리가 실패하여 즉시 중단했습니다. 원장과 대상 상태를 확인하기 전 재실행하지 마세요.");
    }
  }
  console.log(JSON.stringify({ mode: "applied", deleted, skipped, remainingOrdinaryAccounts: await prisma.user.count({ where: { role: "user" } }), remainingAdministrators: await prisma.user.count({ where: { role: "admin" } }), unresolved: (await readPrivacyReplaySnapshot()).unresolved }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "정리에 실패했습니다."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
