import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isRequestOriginAllowed } from "@/server/http/cors";
import {
  consumeRateLimit,
  getJournalPublicationIpRateLimitPolicy,
  selectApiRateLimitPolicy,
} from "@/server/http/rateLimit";

export function proxy(request: NextRequest) {
  const policy = selectApiRateLimitPolicy(
    request.nextUrl.pathname,
    request.method,
  );

  if (!policy) return NextResponse.next();

  const identities = createRequestIdentities(request);
  const results = [
    consumeRateLimit(
      policy.id === "journal-publication"
        ? identities.session
        : identities.sessionAndIp,
      policy,
    ),
    ...(policy.id === "journal-publication"
      ? [
          consumeRateLimit(
            identities.ip,
            getJournalPublicationIpRateLimitPolicy(),
          ),
        ]
      : []),
  ];
  const result = mergeRateLimitResults(results);
  if (result.allowed) {
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1_000)));
    return response;
  }

  const response = NextResponse.json(
    {
      error: "요청이 잠시 너무 많아요. 잠시 후 다시 시도해주세요.",
      code: "rate_limited",
    },
    { status: 429 },
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", "0");
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1_000)));

  const origin = request.headers.get("origin");
  if (origin && isRequestOriginAllowed(request)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  return response;
}

function createRequestIdentities(request: NextRequest) {
  const ip = firstHeaderValue(
    request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip"),
  ) ?? "unknown";
  const authorization = request.headers.get("authorization") ?? "anonymous";
  const sessionKey = createHash("sha256")
    .update(authorization)
    .digest("hex")
    .slice(0, 16);

  return {
    ip: `ip:${ip}`,
    session: `session:${sessionKey}`,
    sessionAndIp: `session:${sessionKey}:ip:${ip}`,
  };
}

function mergeRateLimitResults(
  results: ReturnType<typeof consumeRateLimit>[],
) {
  const blockedResults = results.filter((result) => !result.allowed);
  const limitingResult = [...results].sort(
    (left, right) => left.remaining - right.remaining,
  )[0]!;

  return {
    allowed: blockedResults.length === 0,
    limit: limitingResult.limit,
    remaining: limitingResult.remaining,
    resetAt: limitingResult.resetAt,
    retryAfterSeconds:
      blockedResults.length > 0
        ? Math.max(...blockedResults.map((result) => result.retryAfterSeconds))
        : limitingResult.retryAfterSeconds,
  };
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export const config = {
  matcher: "/api/:path*",
};
