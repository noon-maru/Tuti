import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/server/db/prisma";

export const TRAFFIC_SECURITY_ACTIVATES_AT = "2026-10-10T00:00:00+09:00";
export const TRAFFIC_SECURITY_RETENTION_DAYS = 90;

export type TrafficBlockScope = "actor" | "address";

export type TrafficIdentity = {
  actorKey: string;
  addressKey: string | null;
  agentKey: string;
  addressPreview: string;
  agentSummary: string;
};

type ActiveBlockRule = {
  id: string;
  scope: string;
  subjectKey: string;
  expiresAt: Date | null;
};

let blockRuleCache: { expiresAt: number; rules: ActiveBlockRule[] } | null = null;
const BLOCK_RULE_CACHE_MS = 30_000;

export function isTrafficSecurityActive(
  now = new Date(),
  configured = process.env.TRAFFIC_SECURITY_ENABLED,
) {
  if (configured?.trim().toLowerCase() === "false") return false;
  return now.getTime() >= new Date(TRAFFIC_SECURITY_ACTIVATES_AT).getTime();
}

export function createTrafficIdentity(
  request: Pick<Request, "headers">,
): TrafficIdentity {
  const address = getRequestAddress(request.headers);
  const userAgent = normalizeUserAgent(
    request.headers.get("user-agent") ?? "unknown-agent",
  );
  const addressValue = address ?? "unknown-address";

  return {
    actorKey: trafficHmac(`actor:${addressValue}:${userAgent}`),
    addressKey: address ? trafficHmac(`address:${address}`) : null,
    agentKey: trafficHmac(`agent:${userAgent}`),
    addressPreview: createAddressPreview(address),
    agentSummary: summarizeUserAgent(userAgent),
  };
}

export async function findActiveTrafficBlock(
  request: Pick<Request, "headers">,
  now = new Date(),
) {
  if (!isTrafficSecurityActive(now)) return null;

  const identity = createTrafficIdentity(request);
  const rules = await getActiveBlockRules(now);
  const matchedRule = rules.find((rule) =>
    matchesTrafficIdentity(rule, identity),
  );

  return matchedRule ? { ruleId: matchedRule.id, identity } : null;
}

export function matchesTrafficIdentity(
  rule: Pick<ActiveBlockRule, "scope" | "subjectKey">,
  identity: TrafficIdentity,
) {
  if (rule.scope === "actor") return rule.subjectKey === identity.actorKey;
  if (rule.scope === "address") {
    return Boolean(identity.addressKey) && rule.subjectKey === identity.addressKey;
  }
  return false;
}

export function invalidateTrafficBlockCache() {
  blockRuleCache = null;
}

export function getRequestAddress(headers: Headers) {
  const value =
    firstHeaderValue(headers.get("cf-connecting-ip")) ||
    firstHeaderValue(headers.get("x-forwarded-for")) ||
    firstHeaderValue(headers.get("x-real-ip"));
  if (!value) return null;

  const normalized = value.replace(/^\[|\]$/g, "").trim().toLowerCase();
  return isIP(normalized) ? normalized : null;
}

export function summarizeUserAgent(userAgent: string) {
  if (!userAgent || userAgent === "unknown-agent") return "클라이언트 정보 없음";
  if (/googlebot/i.test(userAgent)) return "Googlebot";
  if (/bingbot/i.test(userAgent)) return "Bingbot";
  if (/applebot/i.test(userAgent)) return "Applebot";
  if (/curl/i.test(userAgent)) return "curl 자동화 도구";
  if (/python-requests|python-urllib/i.test(userAgent)) return "Python 자동화 도구";
  if (/wget/i.test(userAgent)) return "wget 자동화 도구";
  if (/go-http-client/i.test(userAgent)) return "Go HTTP 클라이언트";
  if (/headlesschrome/i.test(userAgent)) return "Headless Chrome";

  const browser = /edg\//i.test(userAgent)
    ? "Edge"
    : /firefox\//i.test(userAgent)
      ? "Firefox"
      : /chrome\//i.test(userAgent)
        ? "Chrome"
        : /safari\//i.test(userAgent)
          ? "Safari"
          : /mozilla\/5\.0/i.test(userAgent)
            ? "브라우저"
            : "알 수 없는 클라이언트";
  const platform = /android/i.test(userAgent)
    ? "Android"
    : /iphone|ipad|ios/i.test(userAgent)
      ? "iOS"
      : /windows/i.test(userAgent)
        ? "Windows"
        : /macintosh|mac os x/i.test(userAgent)
          ? "macOS"
          : /linux/i.test(userAgent)
            ? "Linux"
            : null;

  return platform ? `${browser} · ${platform}` : browser;
}

function createAddressPreview(address: string | null) {
  if (!address) return "주소 확인 불가";
  if (isIP(address) === 4) {
    const segments = address.split(".");
    return `${segments.slice(0, 3).join(".")}.*`;
  }
  const segments = address.split(":").filter(Boolean);
  return `${segments.slice(0, 4).join(":")}::/64`;
}

async function getActiveBlockRules(now: Date) {
  if (blockRuleCache && blockRuleCache.expiresAt > now.getTime()) {
    return blockRuleCache.rules;
  }

  const rules = await prisma.trafficBlockRule.findMany({
    where: {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, scope: true, subjectKey: true, expiresAt: true },
  });
  blockRuleCache = {
    expiresAt: now.getTime() + BLOCK_RULE_CACHE_MS,
    rules,
  };
  return rules;
}

function normalizeUserAgent(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 300) || "unknown-agent";
}

function trafficHmac(value: string) {
  return createHmac("sha256", getTrafficSecuritySecret()).update(value).digest("hex");
}

function getTrafficSecuritySecret() {
  const secret =
    process.env.TRAFFIC_SECURITY_HMAC_SECRET?.trim() ||
    process.env.LOCATION_AUDIT_HMAC_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "TRAFFIC_SECURITY_HMAC_SECRET must contain at least 32 characters.",
    );
  }
  return createHmac("sha256", secret)
    .update("tuti-traffic-security-secret-v1")
    .digest();
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}
