import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("배포용 장소 요약·행동 문구는 중복 없이 길이 규칙과 보완 대상 6곳을 포함한다", () => {
  const repaired = ["130537", "1624070", "4068894", "2657176", "1277679", "3531836"];
  for (const [file, field, limit] of [
    ["data/place-overview-summaries/2026-10-01.jsonl", "summary", 180],
    ["data/place-suggested-actions/2026-10-01.jsonl", "action", 60],
  ] as const) {
    const seen = new Map<string, unknown>();
    for (const line of readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
      const row = JSON.parse(line) as Record<string, unknown>;
      assert.equal(typeof row.contentId, "string");
      const id = row.contentId as string;
      assert.ok(!seen.has(id), `${file}: 중복 ${id}`);
      assert.deepEqual(Object.keys(row).sort(), ["contentId", field].sort());
      const value = row[field];
      if (value !== null || field === "action") {
        assert.equal(typeof value, "string");
        assert.ok((value as string).trim().length > 0 && (value as string).length <= limit, `${id}: 길이 오류`);
      }
      seen.set(id, value);
    }
    for (const id of repaired) assert.ok(typeof seen.get(id) === "string" && (seen.get(id) as string).length > 0, `${id}: ${field} 누락`);
  }
});
