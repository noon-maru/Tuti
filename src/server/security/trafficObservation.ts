import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import {
  createTrafficIdentity,
  isTrafficSecurityActive,
  TRAFFIC_SECURITY_RETENTION_DAYS,
} from "@/server/security/trafficSecurity";

export type TrafficKind =
  | "likely_human"
  | "declared_bot"
  | "automation"
  | "unknown";
export type TrafficRiskLevel = "normal" | "low" | "medium" | "high";

export type TrafficClassification = {
  kind: TrafficKind;
  platform: "web" | "android_webview" | "ios_webview" | "server" | "unknown";
  riskLevel: TrafficRiskLevel;
  signal: string;
  pathGroup: string;
};

const DECLARED_BOT_PATTERN =
  /googlebot|bingbot|applebot|duckduckbot|yandexbot|baiduspider|facebookexternalhit|twitterbot|slackbot|discordbot|kakaotalk-scrap/i;
const AUTOMATION_PATTERN =
  /(?:^|[\s/(])(bot|crawler|spider|headlesschrome|curl|wget|python-requests|python-urllib|go-http-client|libwww-perl|scrapy|httpclient)(?:[\s/);]|$)/i;
const SCANNER_PATH_PATTERN =
  /(?:^|\/)(?:\.env|\.git|wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|adminer|vendor\/phpunit|cgi-bin|actuator|server-status|\.well-known\/acme-challenge\/\.\.|etc\/passwd)(?:\/|$)|(?:\.php|\.asp|\.aspx|\.jsp)$/i;
const INJECTION_PATTERN =
  /(?:\.\.\/|%2e%2e|%00|<script|%3cscript|union(?:\s|%20)+select|sleep\s*\(|benchmark\s*\()/i;
const ID_SEGMENT_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f-]{20,}|[0-9]{5,}|[A-Za-z0-9_-]{20,})$/;

export function classifyTrafficRequest(
  request: Pick<Request, "method" | "url" | "headers">,
  options: { rateLimited?: boolean } = {},
): TrafficClassification {
  const url = new URL(request.url);
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  const method = request.method.toUpperCase();
  const rawTarget = `${url.pathname}${url.search}`;
  const pathGroup = normalizeTrafficPath(url.pathname);
  const platform = detectPlatform(userAgent);

  if (method === "TRACE" || method === "CONNECT") {
    return { kind: classifyAgent(userAgent, request), platform, riskLevel: "high", signal: "prohibited_method", pathGroup };
  }
  if (SCANNER_PATH_PATTERN.test(url.pathname)) {
    return { kind: classifyAgent(userAgent, request), platform, riskLevel: "high", signal: "scanner_path", pathGroup };
  }
  if (INJECTION_PATTERN.test(rawTarget)) {
    return { kind: classifyAgent(userAgent, request), platform, riskLevel: "high", signal: "injection_probe", pathGroup };
  }
  if (options.rateLimited) {
    return { kind: classifyAgent(userAgent, request), platform, riskLevel: "medium", signal: "rate_limited", pathGroup };
  }
  if (DECLARED_BOT_PATTERN.test(userAgent)) {
    return { kind: "declared_bot", platform: "server", riskLevel: "normal", signal: "declared_crawler", pathGroup };
  }
  if (!userAgent || AUTOMATION_PATTERN.test(userAgent)) {
    return {
      kind: userAgent ? "automation" : "unknown",
      platform: userAgent ? "server" : "unknown",
      riskLevel: userAgent ? "low" : "medium",
      signal: userAgent ? "automation_agent" : "missing_user_agent",
      pathGroup,
    };
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  const fetchMode = request.headers.get("sec-fetch-mode");
  const browserLike =
    /mozilla\/5\.0/i.test(userAgent) &&
    (fetchSite !== null || fetchMode !== null || platform.endsWith("webview"));
  return {
    kind: browserLike ? "likely_human" : "unknown",
    platform,
    riskLevel: "normal",
    signal: browserLike ? "browser_request" : "unverified_client",
    pathGroup,
  };
}

export async function recordTrafficObservationSafely(
  request: Pick<Request, "method" | "url" | "headers">,
  options: { rateLimited?: boolean; blocked?: boolean } = {},
) {
  try {
    const observedAt = new Date();
    const bucketStartedAt = startOfUtcHour(observedAt);
    const classification = classifyTrafficRequest(request, options);
    const visitorKey = createDailyVisitorKey(request, observedAt);
    const stableIdentity = isTrafficSecurityActive(observedAt)
      ? createTrafficIdentity(request)
      : null;
    const retentionUntil = new Date(observedAt);
    retentionUntil.setUTCDate(
      retentionUntil.getUTCDate() + TRAFFIC_SECURITY_RETENTION_DAYS,
    );

    await prisma.trafficObservation.upsert({
      where: {
        bucketStartedAt_visitorKey_pathGroup_method_signal: {
          bucketStartedAt,
          visitorKey,
          pathGroup: classification.pathGroup,
          method: request.method.toUpperCase().slice(0, 12),
          signal: classification.signal,
        },
      },
      create: {
        id: randomUUID(),
        bucketStartedAt,
        visitorKey,
        actorKey: stableIdentity?.actorKey,
        addressKey: stableIdentity?.addressKey,
        agentKey: stableIdentity?.agentKey,
        addressPreview: stableIdentity?.addressPreview,
        agentSummary: stableIdentity?.agentSummary,
        kind: classification.kind,
        platform: classification.platform,
        riskLevel: classification.riskLevel,
        signal: classification.signal,
        pathGroup: classification.pathGroup,
        method: request.method.toUpperCase().slice(0, 12),
        rateLimitedCount: options.rateLimited ? 1 : 0,
        blockedCount: options.blocked ? 1 : 0,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        retentionUntil,
      },
      update: {
        requestCount: { increment: 1 },
        rateLimitedCount: options.rateLimited ? { increment: 1 } : undefined,
        blockedCount: options.blocked ? { increment: 1 } : undefined,
        actorKey: stableIdentity?.actorKey,
        addressKey: stableIdentity?.addressKey,
        agentKey: stableIdentity?.agentKey,
        addressPreview: stableIdentity?.addressPreview,
        agentSummary: stableIdentity?.agentSummary,
        lastSeenAt: observedAt,
        retentionUntil,
      },
    });
  } catch (error) {
    console.error("트래픽 관측 기록을 저장하지 못했습니다.", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export function normalizeTrafficPath(pathname: string) {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .slice(0, 6)
    .map((segment, index, all) => {
      if (all[0] === "shared" && index === 1) return ":publicId";
      return ID_SEGMENT_PATTERN.test(segment) ? ":id" : segment.slice(0, 48);
    });
  return `/${segments.join("/")}`.slice(0, 180) || "/";
}

function classifyAgent(
  userAgent: string,
  request: Pick<Request, "headers">,
): TrafficKind {
  if (DECLARED_BOT_PATTERN.test(userAgent)) return "declared_bot";
  if (!userAgent) return "unknown";
  if (AUTOMATION_PATTERN.test(userAgent)) return "automation";
  return request.headers.get("sec-fetch-site") !== null
    ? "likely_human"
    : "unknown";
}

function detectPlatform(userAgent: string): TrafficClassification["platform"] {
  if (!userAgent) return "unknown";
  if (/android/i.test(userAgent) && /;\s*wv\)|\bwv\b|version\/4\.0/i.test(userAgent)) {
    return "android_webview";
  }
  if (/(iphone|ipad)/i.test(userAgent) && !/safari\//i.test(userAgent)) {
    return "ios_webview";
  }
  if (/mozilla\/5\.0/i.test(userAgent)) return "web";
  return "server";
}

function createDailyVisitorKey(
  request: Pick<Request, "headers">,
  observedAt: Date,
) {
  const address =
    firstHeaderValue(request.headers.get("cf-connecting-ip")) ||
    firstHeaderValue(request.headers.get("x-forwarded-for")) ||
    firstHeaderValue(request.headers.get("x-real-ip")) ||
    "unknown-address";
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? "unknown-agent";
  const date = observedAt.toISOString().slice(0, 10);
  return createHmac("sha256", getTrafficAuditSecret())
    .update(`tuti-traffic:${date}:${address}:${userAgent}`)
    .digest("hex");
}

function getTrafficAuditSecret() {
  const secret = process.env.LOCATION_AUDIT_HMAC_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("LOCATION_AUDIT_HMAC_SECRET must contain at least 32 characters.");
  }
  return createHmac("sha256", secret)
    .update("tuti-traffic-observation-secret-v1")
    .digest();
}

function startOfUtcHour(value: Date) {
  const result = new Date(value);
  result.setUTCMinutes(0, 0, 0);
  return result;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}
