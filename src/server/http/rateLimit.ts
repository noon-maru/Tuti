export type RateLimitPolicy = {
  id: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const windows = new Map<string, RateLimitEntry>();
let requestsSinceCleanup = 0;

const policies = {
  default: { id: "default", limit: 120, windowMs: 60_000 },
  read: { id: "read", limit: 240, windowMs: 60_000 },
  anonymousSession: { id: "anonymous-session", limit: 10, windowMs: 60_000 },
  emailCodeRequest: { id: "email-code-request", limit: 5, windowMs: 15 * 60_000 },
  emailCodeVerify: { id: "email-code-verify", limit: 15, windowMs: 15 * 60_000 },
  oauth: { id: "oauth", limit: 20, windowMs: 10 * 60_000 },
  recommendation: { id: "recommendation", limit: 30, windowMs: 60_000 },
  routePlanning: { id: "route-planning", limit: 40, windowMs: 60_000 },
  imageMutation: { id: "image-mutation", limit: 12, windowMs: 10 * 60_000 },
  journalPublication: {
    id: "journal-publication",
    limit: 6,
    windowMs: 60 * 60_000,
  },
  userSubmission: { id: "user-submission", limit: 10, windowMs: 60 * 60_000 },
  admin: { id: "admin", limit: 300, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

export function selectApiRateLimitPolicy(pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase();

  if (pathname === "/api/health" || normalizedMethod === "OPTIONS") return null;
  if (pathname.startsWith("/api/admin/")) return policies.admin;
  if (pathname === "/api/anonymous-session" && normalizedMethod === "POST") {
    return policies.anonymousSession;
  }
  if (pathname === "/api/auth/email/request-code") return policies.emailCodeRequest;
  if (pathname === "/api/auth/email/verify-code") return policies.emailCodeVerify;
  if (pathname.startsWith("/api/auth/oauth/")) return policies.oauth;
  if (pathname === "/api/recommendations" && normalizedMethod === "POST") {
    return policies.recommendation;
  }
  if (
    pathname.endsWith("/travel-time") ||
    pathname.endsWith("/departure-plan")
  ) {
    return policies.routePlanning;
  }
  if (
    pathname.startsWith("/api/journal-entry-images/") &&
    normalizedMethod !== "GET"
  ) {
    return policies.imageMutation;
  }
  if (
    pathname.endsWith("/publication") &&
    normalizedMethod === "PATCH"
  ) {
    return policies.journalPublication;
  }
  if (
    normalizedMethod === "POST" &&
    (pathname === "/api/inquiries" ||
      pathname === "/api/reports" ||
      pathname === "/api/account-deletion-requests")
  ) {
    return policies.userSubmission;
  }
  if (normalizedMethod === "GET") return policies.read;
  return policies.default;
}

export function consumeRateLimit(
  identity: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  cleanupExpiredWindows(now);
  const key = `${policy.id}:${identity}`;
  const current = windows.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + policy.windowMs }
    : current;

  entry.count += 1;
  windows.set(key, entry);

  const allowed = entry.count <= policy.limit;
  return {
    allowed,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
  };
}

function cleanupExpiredWindows(now: number) {
  requestsSinceCleanup += 1;
  if (requestsSinceCleanup < 500 && windows.size < 10_000) return;

  requestsSinceCleanup = 0;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }

  if (windows.size <= 20_000) return;
  const oldest = [...windows.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt)
    .slice(0, windows.size - 20_000);
  for (const [key] of oldest) windows.delete(key);
}

export function resetRateLimitsForTest() {
  windows.clear();
  requestsSinceCleanup = 0;
}
