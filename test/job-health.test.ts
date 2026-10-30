import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JOB_IDS } from "../src/shared/api/jobHealth";
import { parseJobHealth } from "../src/server/admin/jobHealth";

const now = Date.parse("2026-10-30T04:00:00Z");
const snapshot = () => ({ version: 1, capturedAt: new Date(now).toISOString(), jobs: JOB_IDS.map(id => ({ id, state: "healthy", lastAttemptAt: new Date(now - 1000).toISOString(), lastSuccessAt: new Date(now - 1000).toISOString(), nextAt: null })) });
test("예약 작업 관측 없음·만료·미래 시각을 정상으로 위장하지 않는다", () => {
  assert.equal(parseJobHealth(null, now).fresh, false);
  assert.equal(parseJobHealth(snapshot(), now).jobs.every(row => row.state === "healthy"), true);
  assert.equal(parseJobHealth(snapshot(), now + 181_000).jobs.every(row => row.state === "unknown"), true);
  assert.equal(parseJobHealth(snapshot(), now - 31_000).fresh, false);
  const missing = snapshot(); missing.jobs.pop();
  assert.equal(parseJobHealth(missing, now).jobs.at(-1)?.state, "unknown");
  const falseSuccess = snapshot(); falseSuccess.jobs[0].lastSuccessAt = "bad";
  assert.equal(parseJobHealth(falseSuccess, now).jobs[0].state, "unknown");
});
test("실패·지연·중복 항목을 구분하고 원문·웹훅·임의 필드는 관리자에 전달하지 않는다", async () => {
  const input = snapshot(); input.jobs[0].state = "failed"; input.jobs[1].state = "overdue";
  const output = parseJobHealth({ ...input, webhook: "secret", jobs: input.jobs.map(row => ({ ...row, error: "private" })) }, now);
  assert.equal(output.jobs[0].state, "failed"); assert.equal(output.jobs[1].state, "overdue");
  assert.doesNotMatch(JSON.stringify(output), /secret|private|webhook/);
  const { sanitizeJobSnapshot } = await import("../scripts/publish-job-health.mjs");
  assert.doesNotMatch(JSON.stringify(sanitizeJobSnapshot({ ...input, error: "private" })), /private/);
  assert.throws(() => sanitizeJobSnapshot({ ...input, jobs: [input.jobs[0], ...input.jobs.slice(0, 4)] }));
  const collector = readFileSync("scripts/ops/tuti-job-health-collect", "utf8");
  assert.match(collector, /systemctl show/);
  assert.match(collector, /docker exec -i tuti-ops-maintenance node scripts\/publish-job-health.mjs/);
  assert.doesNotMatch(collector, /source .*env|\.env.production|journalctl|--apply/);
  const web = readFileSync("src/server/admin/jobHealth.ts", "utf8");
  assert.doesNotMatch(web, /execFile|spawn\(|process\.env|docker\.sock/);
});
