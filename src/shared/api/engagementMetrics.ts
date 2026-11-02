export type RetentionMetric = { day: number; eligible: number; returned: number; pending: number; rate: number | null };
export type SessionSummary = {
  observed: number; measured: number; incomplete: number; meanSeconds: number | null; medianSeconds: number | null;
  p90Seconds: number | null; shortSessions: number; observedSpanSessions: number; observedSpanMeanSeconds: number | null;
};
export type EngagementMetrics = {
  coverage: { activeUsers: number; lifecycleUsers: number; legacyOnlyUsers: number; measuredUsers: number; rate: number | null; measuredSince: string | null };
  sessions: SessionSummary;
  distribution: Array<{ label: string; sessions: number }>;
  retention: RetentionMetric[];
  cohorts: Array<{ day: string; users: number; d1: number | null; d7: number | null; d30: number | null }>;
  environments: Array<{ platform: string; appVersion: string; users: number; measuredUsers: number; measuredSessions: number; meanSeconds: number | null; medianSeconds: number | null }>;
};
