import { createHash } from "node:crypto";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { isRequestOriginAllowed } from "@/server/http/cors";
import {
  consumeRateLimit,
  getJournalPublicationIpRateLimitPolicy,
  selectApiRateLimitPolicy,
} from "@/server/http/rateLimit";
import { recordTrafficObservationSafely } from "@/server/security/trafficObservation";
import { findActiveTrafficBlock } from "@/server/security/trafficSecurity";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!shouldBypassTrafficSecurity(request.nextUrl.pathname)) {
    try {
      const block = await findActiveTrafficBlock(request);
      if (block) {
        observeTraffic(event, request, false, true);
        return createBlockedResponse(request);
      }
    } catch (error) {
      console.error("트래픽 차단 규칙을 확인하지 못했습니다.", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  const policy = selectApiRateLimitPolicy(
    request.nextUrl.pathname,
    request.method,
  );

  if (!policy) {
    observeTraffic(event, request, false);
    return NextResponse.next();
  }

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
    observeTraffic(event, request, false);
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1_000)));
    return response;
  }

  observeTraffic(event, request, true);

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

function observeTraffic(
  event: NextFetchEvent,
  request: NextRequest,
  rateLimited: boolean,
  blocked = false,
) {
  const pathname = request.nextUrl.pathname;
  if (
    pathname === "/api/health" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    return;
  }
  event.waitUntil(
    recordTrafficObservationSafely(request, { rateLimited, blocked }),
  );
}

function createBlockedResponse(request: NextRequest) {
  const response = NextResponse.json(
    {
      error: "이 요청은 서비스 보안 정책에 따라 제한되었어요.",
      code: "security_blocked",
    },
    { status: 403 },
  );
  response.headers.set("Cache-Control", "no-store");

  const origin = request.headers.get("origin");
  if (origin && isRequestOriginAllowed(request)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function shouldBypassTrafficSecurity(pathname: string) {
  return (
    pathname === "/api/health" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|images/|fonts/).*)",
  ],
};
