import type {
  AppUpdatePolicyResponse,
  NativeAppPlatform,
} from "@/shared/api/appUpdate";

const VERSION_PATTERN = /^\d+(?:\.\d+){0,3}$/;

const DEFAULT_STORE_URLS: Record<NativeAppPlatform, string> = {
  android:
    "https://play.google.com/store/apps/details?id=com.noonmaru.tuti",
  ios: "https://apps.apple.com/kr/app/tuti/id6474651880",
};

type AppUpdateEnvironment = Record<string, string | undefined>;

export function createAppUpdatePolicy(
  platform: NativeAppPlatform,
  currentVersion: string,
  environment: AppUpdateEnvironment = process.env,
): AppUpdatePolicyResponse {
  const normalizedCurrentVersion = normalizeVersion(currentVersion);
  if (!normalizedCurrentVersion) {
    throw new InvalidAppVersionError();
  }

  const prefix = platform === "android" ? "ANDROID" : "IOS";
  const latestVersion = normalizeConfiguredVersion(
    environment[`APP_UPDATE_${prefix}_LATEST_VERSION`],
  );
  const minimumVersion = normalizeConfiguredVersion(
    environment[`APP_UPDATE_${prefix}_MINIMUM_VERSION`],
  );
  const storeUrl = normalizeStoreUrl(
    environment[`APP_UPDATE_${prefix}_STORE_URL`],
    DEFAULT_STORE_URLS[platform],
  );
  const updateAvailable = Boolean(
    latestVersion && compareAppVersions(normalizedCurrentVersion, latestVersion) < 0,
  );
  const required = Boolean(
    updateAvailable &&
      minimumVersion &&
      compareAppVersions(normalizedCurrentVersion, minimumVersion) < 0,
  );

  return {
    currentVersion: normalizedCurrentVersion,
    latestVersion,
    minimumVersion,
    platform,
    required,
    storeUrl: latestVersion ? storeUrl : null,
    updateAvailable,
  };
}

export function compareAppVersions(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }

  return 0;
}

function parseVersion(version: string) {
  const normalized = normalizeVersion(version);
  if (!normalized) throw new InvalidAppVersionError();
  return normalized.split(".").map(Number);
}

function normalizeVersion(value: string) {
  const normalized = value.trim();
  return VERSION_PATTERN.test(normalized) ? normalized : null;
}

function normalizeConfiguredVersion(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!VERSION_PATTERN.test(normalized)) {
    throw new InvalidAppUpdateConfigurationError();
  }
  return normalized;
}

function normalizeStoreUrl(value: string | undefined, fallback: string) {
  const normalized = value?.trim() || fallback;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
    return url.toString();
  } catch {
    throw new InvalidAppUpdateConfigurationError();
  }
}

export class InvalidAppVersionError extends Error {
  constructor() {
    super("앱 버전을 확인해주세요.");
  }
}

export class InvalidAppUpdateConfigurationError extends Error {
  constructor() {
    super("앱 업데이트 설정을 확인해주세요.");
  }
}
