import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "@/server/db/prisma";

export type LocationSecurityEventCategory =
  | "system_access"
  | "permission_change"
  | "maintenance"
  | "inspection"
  | "incident";
export type LocationSecurityEventResult = "success" | "denied" | "failed";

type SecurityAuditDetails = Record<
  string,
  boolean | number | string | null | Array<boolean | number | string | null>
>;

type LocationSecurityAuditInput = {
  category: LocationSecurityEventCategory;
  result: LocationSecurityEventResult;
  actorUserId?: string;
  actorIdentity: string;
  targetIdentity?: string;
  action: string;
  resource: string;
  details?: SecurityAuditDetails;
  occurredAt?: Date;
};

export type LocationSecurityAuditData = {
  id: string;
  category: LocationSecurityEventCategory;
  result: LocationSecurityEventResult;
  actorKey: string;
  actorUserId?: string;
  targetKey?: string;
  action: string;
  resource: string;
  details?: SecurityAuditDetails;
  occurredAt: Date;
  retentionUntil: Date;
  signatureVersion: "hmac-sha256-v1";
  signature: string;
};

type VerifiableLocationSecurityEvent = {
  id: string;
  category: LocationSecurityEventCategory;
  result: LocationSecurityEventResult;
  actorKey: string;
  actorUserId: string | null;
  targetKey: string | null;
  action: string;
  resource: string;
  details: unknown;
  occurredAt: Date;
  retentionUntil: Date;
  signatureVersion: string;
  signature: string;
};

const SIGNATURE_VERSION = "hmac-sha256-v1" as const;
const FORBIDDEN_DETAIL_KEY =
  /latitude|longitude|coordinates?|coords?|token|password|secret|api.?key|email/i;

export function buildLocationSecurityAuditEventData(
  input: LocationSecurityAuditInput,
): LocationSecurityAuditData {
  const occurredAt = input.occurredAt ?? new Date();
  const data = {
    id: randomUUID(),
    category: input.category,
    result: input.result,
    actorKey: createAuditKey("actor", input.actorIdentity),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.targetIdentity
      ? { targetKey: createAuditKey("target", input.targetIdentity) }
      : {}),
    action: normalizeLabel(input.action, "action"),
    resource: normalizeLabel(input.resource, "resource"),
    ...(input.details ? { details: sanitizeDetails(input.details) } : {}),
    occurredAt,
    retentionUntil: createRetentionUntil(input.category, occurredAt),
    signatureVersion: SIGNATURE_VERSION,
  };

  return {
    ...data,
    signature: signAuditData(data),
  };
}

export async function recordLocationSecurityAuditEvent(
  input: LocationSecurityAuditInput,
) {
  const data = buildLocationSecurityAuditEventData(input);
  await prisma.locationSecurityAuditEvent.create({ data });
  return data;
}

export async function recordLocationSecurityAuditEventSafely(
  input: LocationSecurityAuditInput,
) {
  try {
    return await recordLocationSecurityAuditEvent(input);
  } catch (error) {
    console.error("위치정보 보안 감사기록을 저장하지 못했습니다.", {
      category: input.category,
      action: input.action,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

export async function verifyLocationSecurityAuditEvents({
  take = 10_000,
}: {
  take?: number;
} = {}) {
  const events = await prisma.locationSecurityAuditEvent.findMany({
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: Math.max(1, Math.min(take, 100_000)),
  });
  const invalidIds = events
    .filter((event) => !verifyLocationSecurityAuditEvent(event))
    .map((event) => event.id);

  return {
    checked: events.length,
    valid: events.length - invalidIds.length,
    invalid: invalidIds.length,
    invalidIds,
  };
}

export function verifyLocationSecurityAuditEvent(
  event: VerifiableLocationSecurityEvent,
) {
  if (event.signatureVersion !== SIGNATURE_VERSION) return false;
  const expected = signAuditData({
    id: event.id,
    category: event.category,
    result: event.result,
    actorKey: event.actorKey,
    ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
    ...(event.targetKey ? { targetKey: event.targetKey } : {}),
    action: event.action,
    resource: event.resource,
    ...(event.details && typeof event.details === "object"
      ? { details: event.details }
      : {}),
    occurredAt: event.occurredAt,
    retentionUntil: event.retentionUntil,
    signatureVersion: SIGNATURE_VERSION,
  });
  const actualBuffer = Buffer.from(event.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createRequestAuditIdentity(request: Request) {
  const connectingAddress =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown-address";
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ??
    "unknown-agent";
  return `request:${connectingAddress}:${userAgent}`;
}

function createRetentionUntil(
  category: LocationSecurityEventCategory,
  occurredAt: Date,
) {
  const retentionUntil = new Date(occurredAt);
  const years = category === "system_access" || category === "maintenance"
    ? 1
    : 5;
  retentionUntil.setUTCFullYear(retentionUntil.getUTCFullYear() + years);
  return retentionUntil;
}

function createAuditKey(kind: "actor" | "target", identity: string) {
  const normalized = identity.trim();
  if (!normalized) throw new Error(`${kind} identity is required.`);
  return createHmac("sha256", getAuditSecret())
    .update(`tuti-location-security:${kind}:${normalized}`)
    .digest("hex");
}

function signAuditData(value: Record<string, unknown>) {
  return createHmac("sha256", getAuditSecret())
    .update(canonicalJson(value))
    .digest("hex");
}

function getAuditSecret() {
  const secret =
    process.env.LOCATION_AUDIT_HMAC_SECRET?.trim() ||
    process.env.AUTH_EMAIL_CODE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "LOCATION_AUDIT_HMAC_SECRET must contain at least 32 characters.",
    );
  }
  return createHmac("sha256", secret)
    .update("tuti-location-security-audit-secret-v1")
    .digest();
}

function sanitizeDetails(details: SecurityAuditDetails) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (FORBIDDEN_DETAIL_KEY.test(key)) {
        throw new Error(`Sensitive audit detail key is not allowed: ${key}`);
      }
      return [key, sanitizeDetailValue(value)];
    }),
  );
}

function sanitizeDetailValue(
  value: SecurityAuditDetails[string],
): SecurityAuditDetails[string] {
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error("Audit detail array is too long.");
    return value.map((item) => sanitizeScalar(item));
  }
  return sanitizeScalar(value);
}

function sanitizeScalar(value: boolean | number | string | null) {
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Audit detail number must be finite.");
  }
  return value;
}

function normalizeLabel(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Error(`${field} must contain between 1 and 200 characters.`);
  }
  return normalized;
}

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}
