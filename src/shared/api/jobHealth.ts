export const JOB_IDS = ["rights", "privacy", "ledger", "retention", "core-backup"] as const;
export type JobId = typeof JOB_IDS[number];
export type JobState = "healthy" | "failed" | "overdue" | "running" | "disabled" | "unknown";
export type JobHealth = { id: JobId; state: JobState; lastAttemptAt: string | null; lastSuccessAt: string | null; nextAt: string | null };
export type JobHealthReport = { capturedAt: string | null; fresh: boolean; jobs: JobHealth[] };
