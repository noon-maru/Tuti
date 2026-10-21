import { readFile, stat } from "node:fs/promises";
import { prisma } from "../src/server/db/prisma";
import { updateEvidenceHold } from "../src/server/legal/retention";
import { parseEvidenceHolds, type EvidenceHold } from "../src/server/legal/retentionPolicy";

try {
  const args = process.argv.slice(2);
  const [operation, target, ...options] = args;
  if (!["register", "review", "release"].includes(operation) || !target || target.startsWith("--") || options.length > 1 || options.some(arg => arg !== "--apply")) throw new Error("INVALID_ARGUMENTS");
  const now = new Date();
  let input: Parameters<typeof updateEvidenceHold>[0];
  if (operation === "register") {
    // 파일에는 식별값과 관리 메타데이터만 입력한다. 기록·문의 본문·토큰 등의 증거 원문을 넣지 않는다.
    const info = await stat(target);
    if (!info.isFile() || info.size > 8192) throw new Error("HOLD_INPUT_TOO_LARGE");
    const source = await readFile(target);
    if (source.length > 8192) throw new Error("HOLD_INPUT_TOO_LARGE");
    const parsed = JSON.parse(source.toString("utf8")) as Omit<EvidenceHold, "reviewedAt">;
    if (Object.hasOwn(parsed, "reviewedAt")) throw new Error("SERVER_REVIEW_TIME_REQUIRED");
    const { reviewedAt: _reviewedAt, ...hold } = parseEvidenceHolds(JSON.stringify({ version: 1, holds: [{ ...parsed, reviewedAt: now.toISOString() }] }), now)[0];
    void _reviewedAt;
    input = { operation: "register", hold };
  } else {
    input = { operation: operation as "review" | "release", id: target };
  }
  console.log(JSON.stringify(await updateEvidenceHold(input, now, options.includes("--apply"))));
} catch {
  console.error("사건별 보전 목록 처리에 실패했습니다. 입력·대상·기존 목록을 확인해주세요. 원문과 식별값은 출력하지 않습니다.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
