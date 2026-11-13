import { readFileSync } from "node:fs";
import { prisma } from "../src/server/db/prisma";
import { applyCafeEditorials, cafeEditorialSelection, prepareCafeEditorials } from "../src/server/tourism/cafeEditorialPreparation";

const args = process.argv.slice(2);
if (args.some((arg, index) => arg !== "--apply" && arg !== "--expected-plan-hash" && args[index - 1] !== "--expected-plan-hash")) throw new Error("지원하지 않는 인자입니다.");
const apply = args.includes("--apply"), index = args.indexOf("--expected-plan-hash"), expected = index < 0 ? undefined : args[index + 1];
if (apply && !/^[a-f0-9]{64}$/.test(expected ?? "")) throw new Error("조회한 대상 해시를 --expected-plan-hash로 지정해주세요.");
const manifest = JSON.parse(readFileSync("data/cafe-editorials/2026-11-13.json", "utf8")) as Record<string, string>;
function readItems(file: string, field: string) {
  const rows = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as Record<string, string>);
  if (new Set(rows.map(row => row.contentId)).size !== rows.length) throw new Error("중복된 장소 문구가 있습니다.");
  return new Map(rows.map(row => [row.contentId, row[field]]));
}
const summaries = readItems("data/place-overview-summaries/2026-10-01.jsonl", "summary");
const actions = readItems("data/place-suggested-actions/2026-10-01.jsonl", "action");
try {
  const authored = Object.entries(manifest).map(([contentId, sourceFingerprint]) => ({ contentId, sourceFingerprint, summary: summaries.get(contentId) ?? "", action: actions.get(contentId) ?? "" }));
  const rows = await prisma.place.findMany({ where: { source: "tourapi", sourceId: { in: authored.map(item => item.contentId) } }, select: cafeEditorialSelection });
  const plan = prepareCafeEditorials(rows, authored);
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "dry-run", planHash: plan.planHash, prepared: plan.updates.length,
    priceNotSpecified: plan.updates.filter(item => !item.detail.admissionFee).length, published: 0,
    places: plan.updates.map(({ row, item, profile }) => ({ contentId: item.contentId, name: row.name, typicalMinutes: profile.stayTypicalMinutes, staySource: profile.staySource })) }));
  if (apply) console.log(JSON.stringify({ mode: "applied", ...await applyCafeEditorials(plan, expected!) }));
} catch {
  console.error(JSON.stringify({ status: "failed", reason: "SOURCE_OR_REVIEW_STATE_CHANGED", privateDetailsSuppressed: true }));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
