import { prisma } from "../src/server/db/prisma";
import { CAFE_CATEGORY_CODES } from "../src/server/tourism/cafeClassification";
import { fetchTourismCafePage, importTourismCafePlan, planTourismCafeImport } from "../src/server/tourism/syncTourismCafes";
import type { TourApiPlaceItem } from "../src/server/tourism/tourApiClient";

const args = process.argv.slice(2);
const allowed = new Set(["--apply", "--expected-plan-hash", "--rows", "--pages", "--start-page", "--region-code", "--district-code"]);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error("지원하지 않는 인자입니다.");
  if (args[i] !== "--apply" && (!args[++i] || args[i].startsWith("--"))) throw new Error("인자 값을 지정해주세요.");
}
const value = (key: string) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
function integer(key: string, fallback: number, max: number) {
  const number = Number(value(key) ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new Error(`${key}의 범위를 확인해주세요.`);
  return number;
}
const rows = integer("--rows", 20, 100), pages = integer("--pages", 1, 5), start = integer("--start-page", 1, 100_000);
if (rows * pages * CAFE_CATEGORY_CODES.length > 200) throw new Error("한 번에 조회할 수 있는 최대 수는 200곳입니다.");
const regionCode = value("--region-code"), districtCode = value("--district-code");
for (const code of [regionCode, districtCode]) if (code !== undefined && !/^\d{1,10}$/.test(code)) throw new Error("지역 코드는 숫자로 지정해주세요.");
if (districtCode && !regionCode) throw new Error("시군구 코드에는 시도 코드도 필요합니다.");
const apply = args.includes("--apply"), expected = value("--expected-plan-hash");
if (apply && !/^[a-f0-9]{64}$/.test(expected ?? "")) throw new Error("먼저 조회하고 --expected-plan-hash로 확인한 대상 해시를 지정해주세요.");

try {
  const items: TourApiPlaceItem[] = [];
  const available: { categoryCode: string; total: number }[] = [];
  for (const categoryCode of CAFE_CATEGORY_CODES) {
    for (let offset = 0; offset < pages; offset++) {
      const pageNo = start + offset;
      const page = await fetchTourismCafePage({ categoryCode, pageNo, numOfRows: rows, regionCode, districtCode });
      if (!offset) available.push({ categoryCode, total: page.totalCount });
      items.push(...page.items);
      if (!page.items.length || pageNo * rows >= page.totalCount) break;
    }
  }
  const plan = planTourismCafeImport(items);
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "dry-run", planHash: plan.planHash, available,
    accepted: plan.accepted.length, skipped: plan.skipped,
    places: plan.accepted.map(item => ({ contentId: item.contentid, name: item.title, categoryCode: item.lclsSystm3, hasImage: Boolean(item.firstimage || item.firstimage2) })),
    databaseChanged: false, automaticallyPublished: 0 }, null, 2));
  if (apply) console.log(JSON.stringify({ mode: "applied", ...await importTourismCafePlan(plan, expected!) }));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", code: error && typeof error === "object" && "code" in error ? error.code : "CAFE_SYNC_FAILED", privateDetailsSuppressed: true }));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
