import { prisma } from "../src/server/db/prisma";
import { syncTourismPlaces } from "../src/server/tourism/syncTourismPlaces";

const args = process.argv.slice(2);
const maxPages = readIntegerArgument(args, "--pages", 10);
const pageSize = readIntegerArgument(args, "--rows", 100);
const startPage = readIntegerArgument(args, "--start-page", 1);
const contentTypeId =
  readArgument(args, "--content-type")?.trim() || "12";

try {
  const result = await syncTourismPlaces({
    contentTypeId,
    maxPages,
    pageSize,
    startPage,
  });

  console.log("TourAPI 장소 동기화를 완료했습니다.");
  console.table(result);

  if (result.failed > 0) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

function readArgument(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function readIntegerArgument(
  args: string[],
  name: string,
  fallback: number,
) {
  const value = Number(readArgument(args, name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
