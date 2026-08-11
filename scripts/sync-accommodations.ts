import { prisma } from "../src/server/db/prisma";
import { syncAccommodationSources } from "../src/server/accommodations/accommodationService";

const args = process.argv.slice(2);
const pageSize = readInteger(args, "--rows", 100);
const maxPages = args.includes("--all")
  ? undefined
  : readInteger(args, "--pages", 10);

try {
  console.log(
    maxPages
      ? `숙박 원천을 최대 ${maxPages}쪽까지 동기화합니다.`
      : "숙박 원천 전수 동기화를 시작합니다.",
  );
  console.log(await syncAccommodationSources({ pageSize, maxPages }));
} finally {
  await prisma.$disconnect();
}

function readInteger(args: string[], name: string, fallback: number) {
  const index = args.indexOf(name);
  const value = Number(index >= 0 ? args[index + 1] : undefined);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
