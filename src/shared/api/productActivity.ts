export const PRODUCT_ACTIVITY_TYPES = [
  "session_started",
  "entry_started",
  "entry_completed",
  "entry_skipped",
  "main_viewed",
] as const;

export const PRODUCT_ACTIVITY_PLATFORMS = [
  "web",
  "android",
  "ios",
] as const;

export type ProductActivityType =
  (typeof PRODUCT_ACTIVITY_TYPES)[number];

export type ProductActivityPlatform =
  (typeof PRODUCT_ACTIVITY_PLATFORMS)[number];

export type ProductActivityInput = {
  clientSessionId: string;
  action: ProductActivityType;
  platform: ProductActivityPlatform;
  appVersion?: string;
};

export type ProductActivityResponse = {
  recorded: true;
};

const CLIENT_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeProductActivityInput(
  input: unknown,
): ProductActivityInput | null {
  if (!input || typeof input !== "object") return null;

  const value = input as Partial<ProductActivityInput>;
  const clientSessionId = normalizeText(value.clientSessionId, 36);
  const action = normalizeAction(value.action);
  const platform = normalizePlatform(value.platform);
  const appVersion = normalizeText(value.appVersion, 40);

  if (
    !clientSessionId ||
    !CLIENT_SESSION_ID_PATTERN.test(clientSessionId) ||
    !action ||
    !platform
  ) {
    return null;
  }

  return {
    clientSessionId,
    action,
    platform,
    ...(appVersion ? { appVersion } : {}),
  };
}

function normalizeAction(value: unknown): ProductActivityType | null {
  return typeof value === "string" &&
    PRODUCT_ACTIVITY_TYPES.includes(value as ProductActivityType)
    ? (value as ProductActivityType)
    : null;
}

function normalizePlatform(value: unknown): ProductActivityPlatform | null {
  return typeof value === "string" &&
    PRODUCT_ACTIVITY_PLATFORMS.includes(value as ProductActivityPlatform)
    ? (value as ProductActivityPlatform)
    : null;
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}
