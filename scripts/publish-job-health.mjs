import { pathToFileURL } from "node:url";

const ids = ["rights", "privacy", "ledger", "retention", "core-backup"];
const states = ["healthy", "failed", "overdue", "running", "disabled", "unknown"];
export function sanitizeJobSnapshot(value) {
  if (!value || value.version !== 1 || typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt)) || !Array.isArray(value.jobs) || value.jobs.length !== ids.length) throw new Error("INVALID_SNAPSHOT");
  const date = value => value === null ? null : typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : (() => { throw new Error("INVALID_TIMESTAMP"); })();
  return { version: 1, capturedAt: new Date(value.capturedAt).toISOString(), jobs: ids.map(id => {
    const matches = value.jobs.filter(row => row?.id === id);
    if (matches.length !== 1 || !states.includes(matches[0].state)) throw new Error("INVALID_JOB");
    const row = matches[0];
    return { id, state: row.state, lastAttemptAt: date(row.lastAttemptAt), lastSuccessAt: date(row.lastSuccessAt), nextAt: date(row.nextAt) };
  }) };
}
async function main() {
  let text = "";
  for await (const chunk of process.stdin) { text += chunk; if (text.length > 16_384) throw new Error("SNAPSHOT_TOO_LARGE"); }
  const snapshot = sanitizeJobSnapshot(JSON.parse(text));
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await client.connect();
    await client.query(`INSERT INTO system_logs(id,category,action,level,message,metadata,created_at)
      VALUES('tuti-job-health-v1','operations','jobs.observed','info','예약 작업 상태 관측',$1::jsonb,now())
      ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,created_at=EXCLUDED.created_at`, [JSON.stringify(snapshot)]);
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("정제된 예약 작업 상태를 게시하지 못했습니다. 상세 원문은 출력하지 않습니다."); process.exitCode = 1; });
}
