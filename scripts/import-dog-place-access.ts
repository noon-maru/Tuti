import { readFile } from "node:fs/promises";
import { prisma } from "../src/server/db/prisma";
import { parseDogAccess } from "../src/shared/pets/dogAccess";

// Local curated facts only. Never infers dog access from a park/cafe category or performs remote fetches.
const args = process.argv.slice(2);
const path = args.find(arg => !arg.startsWith("--"));
if (!path || args.some(arg => arg.startsWith("--") && arg !== "--apply")) throw new Error("입력 JSON 파일과 선택 --apply만 지정해주세요.");
try {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(raw) || raw.length > 1000) throw new Error("최대 1,000개 확인 자료를 입력해주세요.");
  const rows = raw.map(value => {
    const data = parseDogAccess(value);
    if (!data || typeof value.placeId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.placeId) || Date.parse(data.checkedAt) > Date.now()) throw new Error("동반 조건·출처·확인일을 확인해주세요.");
    return { placeId: value.placeId as string, allowed: data.allowed, areas: data.areas, rules: data.rules, maxWeightKg: data.maxWeightKg, leashRequired: data.leashRequired, carrierRequired: data.carrierRequired, sourceUrl: data.sourceUrl, checkedAt: new Date(data.checkedAt), validUntil: new Date(data.validUntil) };
  });
  if (new Set(rows.map(row => row.placeId)).size !== rows.length) throw new Error("장소가 중복돼요.");
  if (await prisma.place.count({ where: { id: { in: rows.map(row => row.placeId) } } }) !== rows.length) throw new Error("등록되지 않은 장소가 포함돼요.");
  if (args.includes("--apply")) await prisma.$transaction(rows.map(row => prisma.dogPlaceAccess.upsert({ where: { placeId: row.placeId }, create: row, update: row })));
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "applied" : "dry-run", records: rows.length, sourceTextSuppressed: true }));
} finally { await prisma.$disconnect(); }
