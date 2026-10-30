import { JOB_IDS, type JobHealthReport, type JobHealth, type JobState } from "@/shared/api/jobHealth";
const states: JobState[] = ["healthy", "failed", "overdue", "running", "disabled", "unknown"];
const unknown = (): JobHealthReport => ({ capturedAt: null, fresh: false, jobs: JOB_IDS.map(id => ({ id, state: "unknown", lastAttemptAt: null, lastSuccessAt: null, nextAt: null })) });
export function parseJobHealth(value: unknown, now = Date.now()): JobHealthReport {
  if (!value || typeof value !== "object") return unknown();
  const input = value as { version?: unknown; capturedAt?: unknown; jobs?: unknown };
  const captured = typeof input.capturedAt === "string" ? Date.parse(input.capturedAt) : NaN;
  if (input.version !== 1 || !Number.isFinite(captured) || now - captured > 180_000 || captured > now + 30_000 || !Array.isArray(input.jobs)) return unknown();
  const rows = input.jobs;
  const time = (value: unknown): string | null => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const jobs = JOB_IDS.map(id => {
    const matches = rows.filter((row: unknown) => row && typeof row === "object" && (row as JobHealth).id === id);
    if (matches.length !== 1) return unknown().jobs.find(job => job.id === id)!;
    const row = matches[0] as JobHealth;
    const state = states.includes(row.state) ? row.state : "unknown";
    const lastAttemptAt = time(row.lastAttemptAt), lastSuccessAt = time(row.lastSuccessAt);
    // A success with no valid timestamp is not proof of a functioning scheduler.
    return { id, state: state === "healthy" && (!lastSuccessAt || Date.parse(lastSuccessAt) > now + 30_000) ? "unknown" as const : state,
      lastAttemptAt, lastSuccessAt, nextAt: time(row.nextAt) };
  });
  return { capturedAt: new Date(captured).toISOString(), fresh: true, jobs };
}
export async function readJobHealth(): Promise<JobHealthReport> {
  // A host-side collector publishes one sanitized snapshot through the ops image.
  // Web only reads that row, never systemd/Docker/sudo/env/log files.
  try {
    const { prisma } = await import("@/server/db/prisma");
    const row = await prisma.systemLog.findUnique({ where: { id: "tuti-job-health-v1" }, select: { metadata: true } });
    return parseJobHealth(row?.metadata);
  } catch { return unknown(); }
}
