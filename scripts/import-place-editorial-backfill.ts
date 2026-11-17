import { readFileSync } from "node:fs";
import { prisma } from "../src/server/db/prisma";
import { readablePlaceWhere } from "../src/server/recommendations/dogPlaceWhere";
import { applyEditorialBackfill, editorialBackfillSelection, parseAuthoredEditorials, prepareEditorialBackfill, applyReviewedEditorials, parseReviewedEditorials, prepareReviewedEditorials } from "../src/server/tourism/placeEditorialBackfill";

const args = process.argv.slice(2), inputPaths: string[] = [];
let expected: string | undefined, apply = false, reviewMode = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--input" && args[index + 1]) inputPaths.push(args[++index]);
  else if (args[index] === "--expected-plan-hash" && args[index + 1]) expected = args[++index];
  else if (args[index] === "--apply") apply = true;
  else if (args[index] === "--review") reviewMode = true;
  else throw new Error("지원하지 않는 인자입니다.");
}
if (!inputPaths.length) throw new Error("--input 파일 경로를 지정해주세요.");
if (apply && !/^[a-f0-9]{64}$/.test(expected ?? "")) throw new Error("--apply에는 승인한 --expected-plan-hash가 필요합니다.");
try {
  if (reviewMode) {
    const reviews = inputPaths.flatMap(path => parseReviewedEditorials(readFileSync(path, "utf8")));
    const rows = await prisma.place.findMany({ where: { AND: [readablePlaceWhere, { sourceId: { in: reviews.map(item => item.contentId) } }] }, select: editorialBackfillSelection });
    const plan = prepareReviewedEditorials(rows, reviews);
    console.log(JSON.stringify({ mode: apply ? "review-preflight" : "review-dry-run", planHash: plan.planHash, supplied: plan.supplied, approved: plan.approved, revalidations: plan.updates.length, needsReview: plan.needsReview, databaseChanged: false }));
    if (apply) console.log(JSON.stringify({ mode: "review-applied", ...await applyReviewedEditorials(plan, expected!) }));
  } else {
  const authored = inputPaths.flatMap(path => parseAuthoredEditorials(readFileSync(path, "utf8")));
  const rows = await prisma.place.findMany({ where: { AND: [readablePlaceWhere, { sourceId: { in: authored.map(item => item.contentId) } }] }, select: editorialBackfillSelection });
  const plan = prepareEditorialBackfill(rows, authored);
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "dry-run", planHash: plan.planHash, supplied: plan.supplied, places: plan.updates.length,
    summaries: plan.updates.filter(update => update.summary).length, actions: plan.updates.filter(update => update.action).length, databaseChanged: false }));
  if (apply) console.log(JSON.stringify({ mode: "applied", ...await applyEditorialBackfill(plan, expected!) }));
  }
} finally { await prisma.$disconnect(); }
