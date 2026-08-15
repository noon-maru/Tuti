import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isRequestOriginAllowed } from "@/server/http/cors";
import {
  consumeRateLimit,
  selectApiRateLimitPolicy,
} from "@/server/http/rateLimit";

export function proxy(request: NextRequest) {
  const policy = selectApiRateLimitPolicy(
    request.nextUrl.pathname,
    request.method,
  );

  if (!policy) return NextResponse.next();

  const result = consumeRateLimit(createRequestIdentity(request), policy);
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

function createRequestIdentity(request: NextRequest) {
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

  return `${ip}:${sessionKey}`;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export const config = {
  matcher: "/api/:path*",
};
